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
  } = {}) {
    this.kind = "CDP";
    this.endpoint = endpoint;
    this.browser = null;
  }

  async #connect() {
    if (this.browser) return this.browser;
    if (!brokerEnabled()) throw new Error("browser broker is disabled");
    const puppeteer = loadPuppeteer();
    if (!puppeteer) throw new Error("puppeteer-core is not installed");
    this.browser = await puppeteer.connect({
      browserURL: this.endpoint,
      defaultViewport: null,
    });
    return this.browser;
  }

  async availability() {
    if (!brokerEnabled())
      return { status: "UNAVAILABLE", detail: "broker disabled" };
    if (!loadPuppeteer())
      return { status: "UNAVAILABLE", detail: "puppeteer-core not installed" };
    try {
      await this.#connect();
      return { status: "AVAILABLE", detail: this.endpoint };
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

  async close() {
    // Disconnect, never close: the browser belongs to Yusuf, not to us.
    if (this.browser) await this.browser.disconnect().catch(() => {});
    this.browser = null;
  }
}

module.exports = { CdpBrowserDriver, ENV_ENDPOINT, DEFAULT_ENDPOINT };
