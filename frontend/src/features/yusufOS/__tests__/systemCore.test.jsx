import React from "react";
import { describe, expect, test, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import SystemCore from "../components/core/SystemCore";
import { CORE_STATES } from "../state/commandCenterModel";

/**
 * jsdom has no WebGL, so `detectWebGL()` always resolves to `false` here —
 * these tests exercise exactly the path every CI machine and every operator
 * without a GPU actually takes: the CSS renderer. The WebGL scene itself is a
 * separate lazy chunk (`CoreRingsWebGL.jsx`) that this suite never has to
 * import to prove the fallback contract holds.
 */
describe("System Core renderer selection", () => {
  test("falls back to the CSS renderer when WebGL is unavailable", async () => {
    render(<SystemCore coreState={CORE_STATES.HEALTHY} />);
    await waitFor(() => {
      const host = document.querySelector("[data-core-renderer]");
      expect(host).toHaveAttribute("data-core-renderer", "css");
    });
  });

  test("reflects the asserted core state and never invents one", async () => {
    render(<SystemCore coreState={CORE_STATES.SECURITY_ALERT} />);
    await waitFor(() => {
      expect(document.querySelector("[data-core-state]")).toHaveAttribute(
        "data-core-state",
        "SECURITY_ALERT"
      );
    });
  });

  test("an unknown core state renders as UNKNOWN, not as healthy", async () => {
    render(<SystemCore coreState={null} />);
    await waitFor(() => {
      const host = document.querySelector("[data-core-state]");
      expect(host).toHaveAttribute("data-core-state", "UNKNOWN");
      expect(host).toHaveAttribute("data-core-energy", "DORMANT");
    });
  });

  test("respects prefers-reduced-motion by pausing ring animation", async () => {
    const original = window.matchMedia;
    window.matchMedia = vi.fn((query) => ({
      matches: query.includes("reduce"),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }));
    render(<SystemCore coreState={CORE_STATES.WORKING} />);
    await waitFor(() => {
      const rings = document.querySelectorAll(".yos-ring");
      expect(rings.length).toBeGreaterThan(0);
      rings.forEach((ring) => {
        expect(ring.style.animationPlayState).toBe("paused");
      });
    });
    window.matchMedia = original;
  });
});
