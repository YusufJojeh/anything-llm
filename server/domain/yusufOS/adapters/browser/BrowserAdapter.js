const { GovernedAdapter } = require("../../execution/AdapterContract");
const { YusufOSError, ErrorCodes } = require("../../errors/YusufOSError");
const { canonicalHash } = require("../../security/canonicalJson");
const {
  assertOriginAllowed,
  safeUrl,
  brokerEnabled,
} = require("./originPolicy");
const {
  sanitizePageState,
  sanitizeAccountIdentity,
} = require("./pageSanitizer");
const { CdpBrowserDriver } = require("./drivers/CdpBrowserDriver");
const { resolveForm, assertPageMatchesForm } = require("./formRegistry");
const {
  assertAccountMatches,
  assertPageUnchanged,
} = require("./mutationGuards");

/**
 * Governed, **read-only** Browser Broker (Phase H).
 *
 * What an Agent can reach through this adapter is a fixed set of typed reads. There is no click,
 * no type, no submit, no navigate, and no `evaluate` — Agents never receive a page handle or a CDP
 * session, only sanitized data. Mutation is Phase I and will arrive as semantic capabilities
 * (`gmail.send_reply`), never as a generic clicker (`adapter-governance.md` §2).
 *
 * Every read enforces, in order: broker enabled → origin allowlisted → tab still on an allowlisted
 * origin at read time → sanitize → attribute as untrusted. Failing any of those refuses the read
 * rather than returning a degraded answer.
 */

const CAPABILITIES = Object.freeze([
  "browser.list_tabs",
  "browser.get_current_url",
  "browser.get_active_account_identity",
  "browser.read_visible_text",
  "browser.read_structured_page",
  "browser.capture_safe_page_state",
  // Phase I. The only mutation this adapter exposes, and it is registry-
  // mediated: see formRegistry.js for why this is not a generic clicker.
  "browser.submit_form",
]);

function denied(message, details = {}) {
  return new YusufOSError(ErrorCodes.POLICY_DENIED, message, {
    status: 403,
    details,
  });
}

class BrowserAdapter extends GovernedAdapter {
  constructor({ driver = null } = {}) {
    super();
    // The CDP driver is the default; tests inject the fixture driver. Both run
    // the identical policy and sanitizer code above them.
    this.driver = driver || new CdpBrowserDriver();
  }

  descriptor() {
    return {
      id: "browser-broker",
      kind: "BROWSER",
      capabilities: CAPABILITIES,
    };
  }

  async availability() {
    if (!brokerEnabled())
      return {
        status: "UNAVAILABLE",
        account: null,
        detail: "broker disabled",
      };
    const status = await this.driver.availability();
    return { status: status.status, account: null, detail: status.detail };
  }

  #assertEnabled() {
    if (!brokerEnabled())
      throw denied("The Yusuf OS Browser Broker is disabled.", {
        reason: "BROKER_DISABLED",
      });
  }

  /**
   * Resolves a tab and re-checks its origin **at use time**.
   *
   * A tab that was allowlisted when it was listed may have navigated since. Re-checking here is
   * what closes that TOCTOU window; without it an Agent could observe an arbitrary origin by
   * listing a tab and waiting.
   */
  async #resolveAllowedTab(tabId) {
    if (!tabId || typeof tabId !== "string")
      throw new YusufOSError(
        ErrorCodes.VALIDATION_ERROR,
        "tabId is required.",
        {
          status: 422,
        }
      );
    let url;
    try {
      url = await this.driver.currentUrl(tabId);
    } catch {
      throw denied("That browser tab is no longer available.", {
        reason: "TAB_UNAVAILABLE",
      });
    }
    assertOriginAllowed(url);
    return { tabId, url };
  }

  async preflight(intentSnapshot) {
    if (intentSnapshot.capabilityKey !== "browser.submit_form")
      // Reads have no bound resource version to drift: the content digest
      // returned by the read itself is what a later comparison uses.
      return {
        ok: true,
        resourceVersion: intentSnapshot?.resourceVersion || null,
      };

    this.#assertEnabled();
    const target = JSON.parse(intentSnapshot.canonicalTarget || "{}");
    const descriptor = resolveForm(target.formKey);
    const tab = await this.#resolveAllowedTab(target.tabId);
    assertPageMatchesForm(descriptor, tab.url);

    const rawPage = await this.driver.readPageState(tab.tabId);
    const page = sanitizePageState(rawPage);
    const rawIdentity = await this.driver.accountIdentity(tab.tabId);
    const identity = sanitizeAccountIdentity({
      ...rawIdentity,
      origin: new URL(tab.url).origin,
    });

    // Same object shape `requestBuilders.js` put in `target.accountIdentity`,
    // so canonicalHash comparisons at the Policy layer are meaningful rather
    // than comparing structurally different objects that could never match.
    const accountIdentity = {
      origin: identity.origin,
      accountLabel: identity.accountLabel,
    };
    const targetIdentityDigest = canonicalHash({
      resource: {
        type: intentSnapshot.resourceType,
        id: intentSnapshot.resourceId,
        version: intentSnapshot.resourceVersion,
      },
      target,
    });
    return {
      accountIdentity,
      resourceVersion: page.contentDigest,
      targetIdentityDigest,
    };
  }

  async prepare(intent) {
    const target = JSON.parse(intent.canonicalTarget || "{}");
    const payload = JSON.parse(intent.canonicalPayload || "{}");
    return {
      capabilityKey: intent.capabilityKey,
      target,
      payload,
      resourceVersion: intent.resourceVersion,
    };
  }

  /**
   * Executes one typed read.
   *
   * Read capabilities are `mutation: false`, so nothing here changes external state and every
   * operation is safely retryable.
   */
  async execute(prepared) {
    this.#assertEnabled();
    const { capabilityKey, target = {}, payload = {} } = prepared;

    switch (capabilityKey) {
      case "browser.submit_form": {
        const descriptor = resolveForm(target.formKey);
        // Final re-check, immediately before the click. Everything here has
        // already been checked once at preflight/policy time; re-doing it
        // now closes the narrow window between that check and this call —
        // including the page content itself, not just origin/path/account,
        // since a rendered page can change without navigating away.
        let tab;
        try {
          tab = await this.#resolveAllowedTab(target.tabId);
          assertPageMatchesForm(descriptor, tab.url);
          const rawIdentity = await this.driver.accountIdentity(tab.tabId);
          const identity = sanitizeAccountIdentity({
            ...rawIdentity,
            origin: new URL(tab.url).origin,
          });
          assertAccountMatches(target.boundAccountDigest, identity);
          const rawPage = await this.driver.readPageState(tab.tabId);
          const page = sanitizePageState(rawPage);
          assertPageUnchanged(prepared.resourceVersion, page.contentDigest);
        } catch (error) {
          // Nothing was clicked: this is a certain, pre-effect refusal.
          error.effectCertain = true;
          throw error;
        }
        try {
          // Selectors come from the descriptor, never from the payload — a
          // model supplies only field values, so the selector is attached
          // here rather than trusted from anything upstream of this line.
          const fields = {};
          for (const [name, value] of Object.entries(payload.fields || {}))
            fields[name] = {
              selector: descriptor.fields[name].selector,
              value,
            };
          const outcome = await this.driver.submitForm(tab.tabId, {
            submitSelector: descriptor.submitSelector,
            fields,
          });
          return {
            outcome: "SUCCEEDED",
            externalReference: `${descriptor.formKey}:${tab.tabId}`,
            result: { url: safeUrl(outcome?.url) },
          };
        } catch (error) {
          // A driver error is trusted to have classified itself
          // (`effectCertain`) — anything that didn't is, by default, unknown
          // rather than a false-clean failure.
          if (error.effectCertain === undefined) error.effectCertain = false;
          throw error;
        }
      }
      case "browser.list_tabs": {
        const tabs = await this.driver.listTabs();
        // Filter again on our side: a driver is trusted to collect, not to police.
        const allowed = tabs
          .filter((tab) => {
            try {
              assertOriginAllowed(tab.url);
              return true;
            } catch {
              return false;
            }
          })
          .map((tab) => ({
            tabId: tab.tabId,
            url: safeUrl(tab.url),
            title: String(tab.title || "").slice(0, 300),
          }));
        return { outcome: "SUCCEEDED", result: { tabs: allowed } };
      }

      case "browser.get_current_url": {
        const tab = await this.#resolveAllowedTab(target.tabId);
        return { outcome: "SUCCEEDED", result: { url: safeUrl(tab.url) } };
      }

      case "browser.get_active_account_identity": {
        const tab = await this.#resolveAllowedTab(target.tabId);
        const identity = await this.driver.accountIdentity(tab.tabId);
        return {
          outcome: "SUCCEEDED",
          result: sanitizeAccountIdentity({
            ...identity,
            origin: new URL(tab.url).origin,
          }),
        };
      }

      case "browser.read_visible_text":
      case "browser.read_structured_page":
      case "browser.capture_safe_page_state": {
        const tab = await this.#resolveAllowedTab(target.tabId);
        const raw = await this.driver.readPageState(tab.tabId);
        // Re-assert on the URL the driver actually read, not the one we resolved.
        assertOriginAllowed(raw?.url || tab.url);
        const state = sanitizePageState(raw);

        if (capabilityKey === "browser.read_visible_text")
          return {
            outcome: "SUCCEEDED",
            result: {
              provenance: state.provenance,
              url: state.url,
              title: state.title,
              visibleText: state.visibleText,
              hasHiddenText: state.hasHiddenText,
              injectionMarkers: state.injectionMarkers,
              truncated: state.truncated,
              contentDigest: state.contentDigest,
            },
          };

        if (capabilityKey === "browser.read_structured_page")
          return {
            outcome: "SUCCEEDED",
            result: {
              provenance: state.provenance,
              url: state.url,
              title: state.title,
              headings: state.headings,
              links: state.links,
              landmarks: state.landmarks,
              frameCount: state.frameCount,
              hasCrossOriginFrames: state.hasCrossOriginFrames,
              contentDigest: state.contentDigest,
            },
          };

        return { outcome: "SUCCEEDED", result: state };
      }

      default:
        throw denied("That browser capability is not available.", {
          reason: "UNKNOWN_CAPABILITY",
          capabilityKey,
        });
    }
  }

  /**
   * Reads need no external verification: there is no side effect to prove happened. The content
   * digest is returned so a caller can detect that the page changed between two reads.
   */
  async verify(intent, executionResult) {
    if (intent?.capabilityKey === "browser.submit_form")
      return this.#verifySubmission(intent, executionResult);
    return {
      status: "VERIFIED",
      evidence: {
        contentDigest: executionResult?.result?.contentDigest || null,
        capabilityKey: intent?.capabilityKey || null,
        digest: canonicalHash({
          capabilityKey: intent?.capabilityKey || null,
          url: executionResult?.result?.url || null,
        }),
      },
    };
  }

  /**
   * Re-reads the page independently of whatever the driver reported at execution time and checks
   * it against the descriptor's own verification signal, the same discipline `git.push_feature_branch`
   * applies with an independent `ls-remote` rather than trusting the push command's own exit code.
   */
  async #verifySubmission(intent, _executionResult) {
    const target = JSON.parse(intent.canonicalTarget || "{}");
    let descriptor;
    try {
      descriptor = resolveForm(target.formKey);
    } catch {
      return {
        status: "UNKNOWN",
        result: { reason: "form no longer registered" },
        evidence: [],
      };
    }
    let tab;
    try {
      tab = await this.#resolveAllowedTab(target.tabId);
    } catch {
      return {
        status: "UNKNOWN",
        result: { reason: "tab unavailable" },
        evidence: [],
      };
    }
    let raw;
    try {
      raw = await this.driver.readPageState(tab.tabId);
    } catch {
      return {
        status: "UNKNOWN",
        result: { reason: "page unreadable" },
        evidence: [],
      };
    }
    const state = sanitizePageState(raw);
    const matched = descriptor.verification.pattern.test(
      descriptor.verification.kind === "URL_PATTERN"
        ? state.url || ""
        : state.visibleText || ""
    );
    return matched
      ? {
          status: "VERIFIED",
          result: { url: state.url },
          evidence: [{ type: descriptor.verification.kind, url: state.url }],
        }
      : { status: "NOT_APPLIED", result: { url: state.url }, evidence: [] };
  }

  /** FAILED_UNKNOWN recovery reuses the identical independent check `verify` uses. */
  async reconcile(intent) {
    const result = await this.#verifySubmission(intent, null);
    if (result.status === "UNKNOWN")
      throw new Error("Browser form submission outcome remains unknown.");
    return { status: result.status };
  }
}

module.exports = { BrowserAdapter, BROWSER_CAPABILITIES: CAPABILITIES };
