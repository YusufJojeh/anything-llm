import { describe, expect, test } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Route separation between the real `/os` Command Center and the dev-only
 * fixture harness.
 *
 * These are static assertions over the real files rather than a rendered
 * router, because the failure mode being guarded is *wiring*: a stray import, a
 * redirect, a harness entry sneaking into the router or the production bundle.
 * A rendering test would not catch any of those, and `main.jsx` creates a
 * browser router and mounts React at module scope, so importing it in a test is
 * not safe.
 *
 * The bug that motivated this: none of the three properties below was actually
 * broken, but the harness *was* leaking `i18nextLng` into the shared origin's
 * localStorage, which silently switched the real app's language and made `/os`
 * look like the harness. That leak is guarded here too.
 */

// Vitest exposes CommonJS-style __dirname for this static filesystem suite.
// eslint-disable-next-line no-undef
const FRONTEND = resolve(__dirname, "../../../..");
const SRC = join(FRONTEND, "src");
const HARNESS_HTML = join(FRONTEND, "yusuf-os-harness.html");
const HARNESS_ENTRY = join(SRC, "features/yusufOS/__dev__/harness.jsx");
const MAIN = join(SRC, "main.jsx");
const INDEX_HTML = join(FRONTEND, "index.html");

/** Every production source file — the harness and the test suite excluded. */
function productionSources(dir = SRC, found = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__dev__" || entry === "__tests__") continue;
      productionSources(full, found);
    } else if (/\.(js|jsx|ts|tsx|css|html)$/.test(entry)) {
      found.push(full);
    }
  }
  return found;
}

describe("1. /os resolves to the real Yusuf OS Command Center", () => {
  const main = readFileSync(MAIN, "utf8");

  test("the router registers /os", () => {
    expect(main).toMatch(/path:\s*"\/os"/);
  });

  test("/os loads the real Yusuf OS page module", () => {
    expect(main).toMatch(/import\(\s*"@\/pages\/YusufOS"\s*\)/);
  });

  test("the real /os page mounts the provider and shell, not a fixture", () => {
    const page = readFileSync(join(SRC, "pages/YusufOS/index.jsx"), "utf8");
    expect(page).toMatch(/YusufOSProvider/);
    expect(page).toMatch(/OSShell/);
    expect(page).not.toMatch(/harness|__dev__|fixtures/i);
  });

  test("the real /os child routes are the product pages", () => {
    for (const page of [
      "CommandCenter",
      "Agents",
      "Tasks",
      "Approvals",
      "Runs",
      "Runtime",
      "Projects",
      "System",
    ])
      expect(main).toContain(`@/pages/YusufOS/${page}`);
  });
});

describe("2. the harness is dev-only and manually addressable only", () => {
  test("the harness entry exists but is not a router route", () => {
    expect(existsSync(HARNESS_HTML)).toBe(true);
    expect(existsSync(HARNESS_ENTRY)).toBe(true);
    const main = readFileSync(MAIN, "utf8");
    expect(main).not.toMatch(/harness/i);
  });

  test("the harness refuses to run outside development", () => {
    const harness = readFileSync(HARNESS_ENTRY, "utf8");
    expect(harness).toMatch(/import\.meta\.env\.DEV/);
    expect(harness).toMatch(/refusing to run outside development/);
  });

  test("the production index.html does not reference the harness", () => {
    expect(readFileSync(INDEX_HTML, "utf8")).not.toMatch(/harness/i);
  });

  test("the harness is not an input of the production build", () => {
    // rollup only takes index.html, so the harness html is never emitted.
    const vite = readFileSync(join(FRONTEND, "vite.config.js"), "utf8");
    expect(vite).not.toMatch(/harness/i);
  });

  test("the harness marks itself as fixtures on screen", () => {
    const harness = readFileSync(HARNESS_ENTRY, "utf8");
    expect(harness).toMatch(/FIXTURE HARNESS/);
    expect(harness).toMatch(/NOT REAL SYSTEM STATE/);
  });
});

describe("3. /os never redirects to the harness", () => {
  test("no production source references the harness at all", () => {
    const offenders = productionSources()
      .filter((file) => /harness/i.test(readFileSync(file, "utf8")))
      .map((file) => file.replace(FRONTEND, ""));
    expect(offenders).toEqual([]);
  });

  test("the router contains no redirect to an html file", () => {
    const main = readFileSync(MAIN, "utf8");
    expect(main).not.toMatch(/Navigate\s+to=["'][^"']*\.html/);
    expect(main).not.toMatch(/location\.(href|replace|assign)/);
  });

  test("the Yusuf OS feature never navigates to a raw html path", () => {
    const feature = productionSources(join(SRC, "features/yusufOS")).concat(
      productionSources(join(SRC, "pages/YusufOS"))
    );
    for (const file of feature) {
      const source = readFileSync(file, "utf8");
      expect(
        source,
        `${file} must not navigate to a raw .html path`
      ).not.toMatch(/(?:to|href)=\{?["'][^"']*\.html/);
    }
  });
});

describe("the harness cannot contaminate the real app's shared state", () => {
  const harness = readFileSync(HARNESS_ENTRY, "utf8");

  test("it blocks the language key it would otherwise persist", () => {
    // The real defect behind the report: `?lang=ar` on the harness wrote
    // i18nextLng for the whole origin, switching `/` and `/os` to Arabic.
    expect(harness).toMatch(/BLOCKED_STORAGE_KEYS/);
    expect(harness).toMatch(/i18nextLng/);
  });

  test("its router is in-memory, so it cannot change the browser URL", () => {
    expect(harness).toMatch(/MemoryRouter/);
    expect(harness).not.toMatch(/BrowserRouter|createBrowserRouter/);
  });

  test("its network and stream stubs stay inside its own document", () => {
    expect(harness).toMatch(/window\.fetch\s*=/);
    expect(harness).toMatch(/window\.EventSource\s*=/);
    // If it ever reached for the opener or parent, the stubs would escape.
    expect(harness).not.toMatch(/window\.(parent|opener|top)\./);
  });
});
