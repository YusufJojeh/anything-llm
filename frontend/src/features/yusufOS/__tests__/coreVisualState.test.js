import { describe, expect, test } from "vitest";
import { CORE_STATES } from "../state/commandCenterModel";
import {
  coreVisual,
  ringAngularVelocity,
  VISUAL_STATE_KEYS,
} from "../state/coreVisualState";

describe("core visual state", () => {
  test("has a visual entry for every core state the backend can assert", () => {
    const known = new Set(VISUAL_STATE_KEYS);
    for (const state of Object.values(CORE_STATES)) {
      expect(known.has(state)).toBe(true);
    }
  });

  test("an unknown core state never resolves to the calm/healthy visual", () => {
    const unknown = coreVisual("SOMETHING_THE_BACKEND_INVENTED_LATER");
    const healthy = coreVisual(CORE_STATES.HEALTHY);
    expect(unknown.known).toBe(false);
    expect(unknown.energy).not.toBe(healthy.energy);
    expect(unknown.haloIntensity).toBeLessThan(healthy.haloIntensity);
  });

  test("a null core state (not yet loaded) is also unknown, not calm", () => {
    const visual = coreVisual(null);
    expect(visual.known).toBe(false);
    expect(visual.state).toBeNull();
  });

  test("reduced motion stops animation but keeps the state's real parameters", () => {
    const animated = coreVisual(CORE_STATES.WORKING, { reducedMotion: false });
    const still = coreVisual(CORE_STATES.WORKING, { reducedMotion: true });
    expect(animated.animated).toBe(true);
    expect(still.animated).toBe(false);
    expect(still.ringPeriods).toEqual(animated.ringPeriods);
    expect(still.haloIntensity).toBe(animated.haloIntensity);
  });

  test("ring angular velocity is zero when not animated, and signed by reversal", () => {
    const still = coreVisual(CORE_STATES.HEALTHY, { reducedMotion: true });
    expect(ringAngularVelocity(still, 0)).toBe(0);

    const forward = coreVisual(CORE_STATES.HEALTHY);
    const reversed = coreVisual(CORE_STATES.BLOCKED);
    expect(ringAngularVelocity(forward, 0)).toBeGreaterThan(0);
    expect(ringAngularVelocity(reversed, 0)).toBeLessThan(0);
  });

  test("every known state reports three finite ring periods", () => {
    for (const state of VISUAL_STATE_KEYS) {
      const visual = coreVisual(state);
      expect(visual.ringPeriods).toHaveLength(3);
      for (const period of visual.ringPeriods) {
        expect(Number.isFinite(period)).toBe(true);
        expect(period).toBeGreaterThan(0);
      }
    }
  });
});
