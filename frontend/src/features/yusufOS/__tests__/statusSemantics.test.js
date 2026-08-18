import { describe, expect, test } from "vitest";
import {
  toneFor,
  toneIcon,
  toneStyle,
  TONES,
  TONE_SEVERITY,
} from "../state/statusSemantics";

describe("status semantics", () => {
  test("an unrecognised status never reads as healthy", () => {
    expect(toneFor("agent", "SOME_FUTURE_STATE")).toBe(TONES.UNKNOWN);
    expect(toneFor("nonexistent-domain", "RUNNING")).toBe(TONES.UNKNOWN);
    expect(toneFor("agent", undefined)).toBe(TONES.UNKNOWN);
  });

  test("APPROVED is not healthy — approval is not execution", () => {
    expect(toneFor("approval", "APPROVED")).not.toBe(TONES.HEALTHY);
    expect(toneFor("approval", "CONSUMED")).toBe(TONES.HEALTHY);
  });

  test("an unchecked audit chain is not healthy and not an error", () => {
    expect(toneFor("audit", "UNCHECKED")).toBe(TONES.UNKNOWN);
    expect(toneFor("audit", "STALE")).toBe(TONES.WARNING);
    expect(toneFor("audit", "VALID")).toBe(TONES.HEALTHY);
    expect(toneFor("audit", "BROKEN")).toBe(TONES.ERROR);
  });

  test("FAILED_UNKNOWN is distinguished from a plain failure", () => {
    expect(toneFor("execution", "FAILED")).toBe(TONES.ERROR);
    expect(toneFor("execution", "FAILED_UNKNOWN")).toBe(TONES.WARNING);
    expect(toneFor("execution", "EXECUTED_UNVERIFIED")).not.toBe(TONES.HEALTHY);
    expect(toneFor("execution", "VERIFIED")).toBe(TONES.HEALTHY);
  });

  test("every tone carries a colour and an icon, so colour is never alone", () => {
    for (const tone of Object.values(TONES)) {
      const style = toneStyle(tone);
      expect(style.graphic).toMatch(/^var\(--yos-/);
      expect(style.text).toMatch(/^var\(--yos-/);
      expect(typeof toneIcon(tone)).toBe("string");
      expect(toneIcon(tone).length).toBeGreaterThan(0);
    }
  });

  test("severity ranks blocking states above ambient ones", () => {
    expect(TONE_SEVERITY[TONES.BLOCKED]).toBeLessThan(
      TONE_SEVERITY[TONES.APPROVAL]
    );
    expect(TONE_SEVERITY[TONES.APPROVAL]).toBeLessThan(
      TONE_SEVERITY[TONES.WARNING]
    );
    expect(TONE_SEVERITY[TONES.HEALTHY]).toBeGreaterThan(
      TONE_SEVERITY[TONES.ACTIVE]
    );
  });
});
