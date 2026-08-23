const { extractPageState } = require("./extractPageState");
const { evaluateOrigin, brokerEnabled } = require("../originPolicy");

/**
 * Attaches to a Chrome the operator launched himself (ADR-011).
 *
 * Three independent opt-ins are required, and all of them are the operator's:
 *
 * 1. `YUSUF_OS_BROWSER_BROKER_ENABLED=true`;
 * 2. `puppeteer-core` installed — it is *not* a declared server dependency, so a default install
 *    has no browser-automation surface at all;
 * 3. Chrome already running with `--remote-debugging-port`.
 *
 * It **connects**; it never launches a browser, never creates a profile, and never reads cookies,
 * storage, credentials or profile files. `puppeteer-core` is used precisely because it cannot
 * download or start a browser of its own.
 */

const ENV_ENDPOINT = "YUSUF_OS_BROWSER_CDP_ENDPOINT";
const DEFAULT_ENDPOINT = "http://127.0.0.1:9222";
const NAVIGATION_TIMEOUT_MS = 10000;
const DISCOVERY_MAX_BYTES = 16 * 1024;
const LOOPBACK_ENDPOINT_HOSTS = new Set(["127.0.0.1", "::1", "[::1]"]);

function normalizeEndpoint(value) {
  try {
    const url = new URL(String(value));
    if (url.protocol !== "http:" || !LOOPBACK_ENDPOINT_HOSTS.has(url.hostname))
      return null;
    if (url.username || url.password || url.search || url.hash) return null;
    if (url.pathname !== "/" && url.pathname !== "") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function normalizeWebSocketEndpoint(value) {
  try {
    const url = new URL(String(value));
    if (url.protocol !== "ws:" || !LOOPBACK_ENDPOINT_HOSTS.has(url.hostname))
      return null;
    if (url.username || url.password || url.search || url.hash) return null;
    if (!/^\/devtools\/browser\/[A-Za-z0-9._-]{1,200}$/.test(url.pathname))
      return null;
    return url.href;
  } catch {
    return null;
  }
}

function loadPuppeteer() {
  try {
    // Lazy and optional on purpose: absence must degrade to UNAVAILABLE, never crash the server.

    return require("puppeteer-core");
  } catch {
    return null;
  }
}

class CdpBrowserDriver {
  constructor({
    endpoint = process.env[ENV_ENDPOINT] || DEFAULT_ENDPOINT,
    fetchImpl = global.fetch,
    puppeteerLoader = loadPuppeteer,
  } = {}) {
    this.kind = "CDP";
    this.endpoint = normalizeEndpoint(endpoint);
    this.browser = null;
    this.fetchImpl = fetchImpl;
    this.puppeteerLoader = puppeteerLoader;
  }

  async #discoverWebSocketEndpoint() {
    const response = await this.fetchImpl(`${this.endpoint}/json/version`, {
      redirect: "error",
      signal: AbortSignal.timeout(NAVIGATION_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error("browser discovery failed");
    const declaredLength = Number(response.headers?.get?.("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > DISCOVERY_MAX_BYTES)
      throw new Error("browser discovery response is too large");
    const reader = response.body?.getReader?.();
    if (!reader) throw new Error("browser discovery response is unreadable");
    const chunks = [];
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > DISCOVERY_MAX_BYTES) {
        await reader.cancel().catch(() => {});
        throw new Error("browser discovery response is too large");
      }
      chunks.push(value);
    }
    const combined = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const raw = new TextDecoder().decode(combined);
    let discovered;
    try {
      discovered = JSON.parse(raw).webSocketDebuggerUrl;
    } catch {
      throw new Error("browser discovery response is invalid");
    }
    const endpoint = normalizeWebSocketEndpoint(discovered);
    if (!endpoint) throw new Error("browser websocket endpoint is not local");
    return endpoint;
  }

  async #connect() {
    if (this.browser) return this.browser;
    if (!brokerEnabled()) throw new Error("browser broker is disabled");
    if (!this.endpoint) throw new Error("browser endpoint is not local");
    const puppeteer = this.puppeteerLoader();
    if (!puppeteer) throw new Error("puppeteer-core is not installed");
    const browserWSEndpoint = await this.#discoverWebSocketEndpoint();
    this.browser = await puppeteer.connect({
      browserWSEndpoint,
      defaultViewport: null,
    });
    return this.browser;
  }

  async availability() {
    if (!brokerEnabled())
      return { status: "UNAVAILABLE", detail: "broker disabled" };
    if (!this.endpoint)
      return { status: "UNAVAILABLE", detail: "invalid local endpoint" };
    if (!this.puppeteerLoader())
      return { status: "UNAVAILABLE", detail: "puppeteer-core not installed" };
    try {
      await this.#connect();
      return { status: "AVAILABLE", detail: "local browser attached" };
    } catch {
      // Never surface the raw error: it can contain local paths and ports.
      return { status: "UNAVAILABLE", detail: "no attachable browser" };
    }
  }

  /** Only allowlisted origins are even enumerated — an unlisted tab is invisible. */
  async listTabs() {
    const browser = await this.#connect();
    const pages = await browser.pages();
    const tabs = [];
    for (const page of pages) {
      const url = page.url();
      if (!evaluateOrigin(url).allowed) continue;
      tabs.push({
        tabId: page.target()._targetId,
        url,
        title: await page.title().catch(() => ""),
      });
    }
    return tabs;
  }

  async #page(tabId) {
    const browser = await this.#connect();
    for (const page of await browser.pages())
      if (page.target()._targetId === tabId) return page;
    throw new Error("tab is no longer open");
  }

  async currentUrl(tabId) {
    return (await this.#page(tabId)).url();
  }

  async readPageState(tabId) {
    const page = await this.#page(tabId);
    // Re-check at read time: the tab may have navigated since it was listed.
    // This is the TOCTOU the origin allowlist exists to close.
    const url = page.url();
    if (!evaluateOrigin(url).allowed)
      throw new Error("tab navigated to a non-allowlisted origin");
    page.setDefaultTimeout(NAVIGATION_TIMEOUT_MS);
    return page.evaluate(extractPageState);
  }

  /**
   * Account identity from the session, not from page text.
   *
   * We report only that a session cookie *exists* for the origin — never its name, value or any
   * other attribute. A page-supplied display name is not consulted here at all, because a hostile
   * page can print any name it likes.
   */
  async accountIdentity(tabId) {
    const page = await this.#page(tabId);
    const url = page.url();
    if (!evaluateOrigin(url).allowed)
      throw new Error("tab navigated to a non-allowlisted origin");
    let hasSession = false;
    try {
      const client = await page.target().createCDPSession();
      const { cookies } = await client.send("Network.getCookies", {
        urls: [new URL(url).origin],
      });
      // Existence only. No name, no value, nothing persisted or returned.
      hasSession = Array.isArray(cookies) && cookies.length > 0;
      await client.detach().catch(() => {});
    } catch {
      hasSession = false;
    }
    return {
      origin: new URL(url).origin,
      state: hasSession ? "authenticated" : "unauthenticated",
      accountLabel: null,
      verifiedBySession: true,
    };
  }

  /**
   * Fills allowlisted fields and clicks the server-owned submit control.
   *
   * `submitSelector` and every field's `selector` come from the code-owned form descriptor
   * (`formRegistry.js`), never from a model — this method never receives anything an Agent chose.
   * `fields` is `{ [name]: { selector, value } }`, not a bare `{ [name]: value }` map: the selector
   * must travel alongside the value all the way to this call, or a real page ends up typed into
   * whatever the field's semantic name happens to resolve to as a selector rather than the
   * descriptor's actual element.
   */
  async submitForm(tabId, { submitSelector, fields = {} } = {}) {
    const page = await this.#page(tabId);
    const url = page.url();
    if (!evaluateOrigin(url).allowed)
      throw new Error("tab navigated to a non-allowlisted origin");
    page.setDefaultTimeout(NAVIGATION_TIMEOUT_MS);
    try {
      for (const { selector, value } of Object.values(fields))
        await page.type(selector, String(value));
    } catch (error) {
      // Nothing was submitted: a field that could not be filled is a
      // certain, pre-effect failure, never a blind retry candidate.
      throw Object.assign(error, { effectCertain: true });
    }
    // Started together so a fast navigation triggered by the click is not
    // missed by attaching the navigation watcher too late. A form that never
    // navigates (an AJAX submit, say) is not an error — `waitForNavigation`
    // timing out is swallowed exactly as before. Only the click itself
    // determines effectCertain: a click that never dispatched (bad selector,
    // detached element) is a certain pre-effect failure, whereas verifying
    // whether a dispatched click's submission actually landed is what
    // `#verifySubmission`/`reconcile` independently re-check afterward.
    const [clickResult] = await Promise.allSettled([
      page.click(submitSelector),
      page
        .waitForNavigation({ timeout: NAVIGATION_TIMEOUT_MS })
        .catch(() => null),
    ]);
    if (clickResult.status === "rejected")
      throw Object.assign(clickResult.reason, { effectCertain: true });
    return { url: page.url() };
  }

  async close() {
    // Disconnect, never close: the browser belongs to Yusuf, not to us.
    if (this.browser) await this.browser.disconnect().catch(() => {});
    this.browser = null;
  }
}

module.exports = {
  CdpBrowserDriver,
  ENV_ENDPOINT,
  DEFAULT_ENDPOINT,
  normalizeEndpoint,
  normalizeWebSocketEndpoint,
};
