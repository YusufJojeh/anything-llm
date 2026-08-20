/**
 * Deterministic browser driver backed by in-memory fixtures.
 *
 * Every Phase H test runs on this driver, so the suite needs no browser, no network and no
 * authenticated account — but it exercises the *real* origin policy, the real sanitizer and the
 * real adapter. Only the transport is substituted.
 *
 * Fixtures deliberately include hostile pages (hidden instructions, cross-origin iframes,
 * secret-shaped strings, wrong account) because those are the cases the governance exists for.
 */
class FixtureBrowserDriver {
  /**
   * @param {{tabs?: Array<{tabId: string, url: string, title?: string}>,
   *          pages?: Record<string, object>,
   *          identities?: Record<string, object>,
   *          available?: boolean}} fixture
   */
  constructor(fixture = {}) {
    this.kind = "FIXTURE";
    this.tabs = fixture.tabs || [];
    this.pages = fixture.pages || {};
    this.identities = fixture.identities || {};
    this.available = fixture.available !== false;
    // Lets a test simulate the page changing between two reads, which is what
    // Phase I's preflight will have to detect.
    this.mutateOnRead = fixture.mutateOnRead || null;
    this.reads = 0;
    // Phase I: keyed by tabId. `{ resultUrl }` simulates a successful submit
    // that navigated the tab; `{ error: { certain, message } }` simulates a
    // driver failure a test wants classified as a definite or an unknown
    // outcome.
    this.submitPlans = fixture.submitPlans || {};
    this.submitCount = 0;
  }

  async availability() {
    return this.available
      ? { status: "AVAILABLE", detail: "fixture" }
      : { status: "UNAVAILABLE", detail: "fixture driver disabled" };
  }

  async listTabs() {
    return this.tabs.map((tab) => ({
      tabId: tab.tabId,
      url: tab.url,
      title: tab.title || "",
    }));
  }

  #resolveTab(tabId) {
    const tab = this.tabs.find((candidate) => candidate.tabId === tabId);
    if (!tab) throw new Error(`fixture: no such tab ${tabId}`);
    return tab;
  }

  async currentUrl(tabId) {
    return this.#resolveTab(tabId).url;
  }

  async readPageState(tabId) {
    const tab = this.#resolveTab(tabId);
    this.reads += 1;
    const page = this.pages[tab.url];
    if (!page) throw new Error(`fixture: no page state for ${tab.url}`);
    if (this.mutateOnRead && this.reads > 1)
      return { ...page, ...this.mutateOnRead };
    return { url: tab.url, ...page };
  }

  async accountIdentity(tabId) {
    const tab = this.#resolveTab(tabId);
    return this.identities[tab.url] || { state: "unknown" };
  }

  /**
   * Simulates submitting a form. Does not simulate typing into real DOM nodes, but it does enforce
   * the `{ [name]: { selector, value } }` shape every real driver requires — a test that passed a
   * bare `{ [name]: value }` map (the Phase I regression this fixture exists to catch) fails here
   * with a clear message instead of silently "succeeding" against a fixture that never looked.
   */
  async submitForm(tabId, { submitSelector, fields = {} } = {}) {
    const tab = this.#resolveTab(tabId);
    this.submitCount += 1;
    for (const [name, rule] of Object.entries(fields))
      if (!rule || typeof rule.selector !== "string")
        throw new Error(`fixture: field "${name}" is missing its selector`);
    const plan = this.submitPlans[tabId];
    if (!plan) throw new Error(`fixture: no submit plan for ${tabId}`);
    if (plan.error) {
      const error = new Error(plan.error.message || "fixture: submit failed");
      error.effectCertain = plan.error.certain === true;
      throw error;
    }
    if (plan.resultUrl) tab.url = plan.resultUrl;
    return {
      url: tab.url,
      submitSelector,
      fieldCount: Object.keys(fields).length,
    };
  }

  async close() {
    /* nothing to release */
  }
}

module.exports = { FixtureBrowserDriver };
