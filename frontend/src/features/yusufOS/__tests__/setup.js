import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// jsdom implements neither of these, and the Command Center uses both.
if (!window.matchMedia)
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });

if (!window.EventSource)
  window.EventSource = class {
    constructor() {
      this.readyState = 0;
    }
    addEventListener() {}
    removeEventListener() {}
    close() {}
  };

// Nothing in this suite is allowed to reach the network. A test that tries to
// is a test that is not testing what it claims to.
globalThis.fetch = vi.fn(() =>
  Promise.reject(new Error("network access is not available in tests"))
);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
