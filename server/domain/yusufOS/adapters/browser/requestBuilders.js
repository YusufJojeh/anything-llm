const { YusufOSError, ErrorCodes } = require("../../errors/YusufOSError");
const {
  resolveForm,
  assertFieldsAllowed,
  assertPageMatchesForm,
} = require("./formRegistry");
const { assertOriginAllowed, brokerEnabled } = require("./originPolicy");
const { accountIdentityDigest } = require("./mutationGuards");
const {
  sanitizePageState,
  sanitizeAccountIdentity,
} = require("./pageSanitizer");
const { CdpBrowserDriver } = require("./drivers/CdpBrowserDriver");

/**
 * Builds a `browser.submit_form` ActionRequest.
 *
 * An Agent supplies only `formKey`, `tabId` and field values — never a selector, URL or account
 * name. Everything that binds the eventual approval to *this* situation (which origin, which
 * rendered page, which authenticated account) is read live from the browser here, at request-build
 * time, the same way `git.push_feature_branch` reads the live remote fingerprint. `BrowserAdapter`
 * reads it all again at execution time; the two independent reads are what Policy compares to
 * detect drift.
 */
async function buildSubmitFormRequest(args = {}, db, { driver } = {}) {
  if (!brokerEnabled())
    throw new YusufOSError(
      ErrorCodes.POLICY_DENIED,
      "The Yusuf OS Browser Broker is disabled.",
      { status: 403, details: { reason: "BROKER_DISABLED" } }
    );
  const descriptor = resolveForm(args.formKey);
  const cleanedFields = assertFieldsAllowed(descriptor, args.fields);
  let correlation = null;
  if (args.correlation !== undefined) {
    if (
      !args.correlation ||
      args.correlation.resourceType !== "CAREER_OPPORTUNITY" ||
      typeof args.correlation.resourceId !== "string" ||
      args.correlation.resourceId.length === 0 ||
      args.correlation.resourceId.length > 100
    )
      throw new YusufOSError(
        ErrorCodes.VALIDATION_ERROR,
        "correlation must be a bounded Career opportunity reference.",
        { status: 422 }
      );
    correlation = {
      resourceType: args.correlation.resourceType,
      resourceId: args.correlation.resourceId,
    };
  }

  if (!args.tabId || typeof args.tabId !== "string")
    throw new YusufOSError(ErrorCodes.VALIDATION_ERROR, "tabId is required.", {
      status: 422,
    });

  const activeDriver = driver || new CdpBrowserDriver();
  const url = await activeDriver.currentUrl(args.tabId);
  assertOriginAllowed(url);
  assertPageMatchesForm(descriptor, url);

  const rawPage = await activeDriver.readPageState(args.tabId);
  const page = sanitizePageState(rawPage);

  const rawIdentity = await activeDriver.accountIdentity(args.tabId);
  const identity = sanitizeAccountIdentity({
    ...rawIdentity,
    origin: new URL(url).origin,
  });
  // A form submission this consequential must bind to a *proven* account, never
  // to "no constraint" — see mutationGuards.assertAccountMatches for why an
  // unbound approval is refused symmetrically at execution time.
  if (!accountIdentityDigest(identity))
    throw new YusufOSError(
      ErrorCodes.ACTION_FORBIDDEN,
      "The active account could not be verified from the browser session.",
      { status: 403, details: { reason: "ACCOUNT_UNVERIFIED" } }
    );

  return {
    resource: {
      type: "BROWSER_FORM",
      id: `${descriptor.formKey}:${args.tabId}`,
      version: page.contentDigest,
    },
    target: {
      formKey: descriptor.formKey,
      tabId: args.tabId,
      origin: descriptor.origin,
      // Consumed by the generic Policy/Approval account-drift check.
      accountIdentity: {
        origin: identity.origin,
        accountLabel: identity.accountLabel,
      },
      // A second, adapter-internal digest re-checked immediately before the
      // click in `BrowserAdapter.execute` (defense in depth against the
      // narrow window between preflight and execution).
      boundAccountDigest: accountIdentityDigest(identity),
    },
    // Correlation is approval-covered internal metadata. BrowserAdapter sends
    // only `fields`, so this reference never reaches the external page.
    payload: { fields: cleanedFields, correlation },
    environment: "LOCAL",
  };
}

module.exports = { buildSubmitFormRequest };
