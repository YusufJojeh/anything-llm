const {
  isValidTransition,
  MARKETING_TRANSITIONS,
} = require("../../../domain/yusufOS/marketing/transitions");
const {
  MARKETING_CONTENT_STATUSES,
} = require("../../../domain/yusufOS/constants");

describe("Phase M — marketing/transitions", () => {
  test("IDEA may move to DRAFTING or ARCHIVED, nothing else", () => {
    expect(isValidTransition("IDEA", "DRAFTING")).toBe(true);
    expect(isValidTransition("IDEA", "ARCHIVED")).toBe(true);
    expect(isValidTransition("IDEA", "READY_FOR_REVIEW")).toBe(false);
    expect(isValidTransition("IDEA", "SCHEDULED")).toBe(false);
    expect(isValidTransition("IDEA", "PUBLISHED")).toBe(false);
  });

  test("DRAFTING may move to READY_FOR_REVIEW or ARCHIVED, nothing else", () => {
    expect(isValidTransition("DRAFTING", "READY_FOR_REVIEW")).toBe(true);
    expect(isValidTransition("DRAFTING", "ARCHIVED")).toBe(true);
    expect(isValidTransition("DRAFTING", "SCHEDULED")).toBe(false);
    expect(isValidTransition("DRAFTING", "PUBLISHED")).toBe(false);
    expect(isValidTransition("DRAFTING", "IDEA")).toBe(false);
  });

  test("READY_FOR_REVIEW may move forward to SCHEDULED/ARCHIVED, or backward to DRAFTING for revision", () => {
    expect(isValidTransition("READY_FOR_REVIEW", "SCHEDULED")).toBe(true);
    expect(isValidTransition("READY_FOR_REVIEW", "DRAFTING")).toBe(true);
    expect(isValidTransition("READY_FOR_REVIEW", "ARCHIVED")).toBe(true);
    expect(isValidTransition("READY_FOR_REVIEW", "PUBLISHED")).toBe(false);
    expect(isValidTransition("READY_FOR_REVIEW", "IDEA")).toBe(false);
  });

  test("SCHEDULED may move forward to PUBLISHED/ARCHIVED, or backward to DRAFTING if pulled back", () => {
    expect(isValidTransition("SCHEDULED", "PUBLISHED")).toBe(true);
    expect(isValidTransition("SCHEDULED", "DRAFTING")).toBe(true);
    expect(isValidTransition("SCHEDULED", "ARCHIVED")).toBe(true);
    expect(isValidTransition("SCHEDULED", "READY_FOR_REVIEW")).toBe(false);
    expect(isValidTransition("SCHEDULED", "IDEA")).toBe(false);
  });

  test("PUBLISHED may only move to ARCHIVED, never backward", () => {
    expect(isValidTransition("PUBLISHED", "ARCHIVED")).toBe(true);
    expect(isValidTransition("PUBLISHED", "SCHEDULED")).toBe(false);
    expect(isValidTransition("PUBLISHED", "DRAFTING")).toBe(false);
    expect(isValidTransition("PUBLISHED", "READY_FOR_REVIEW")).toBe(false);
    expect(isValidTransition("PUBLISHED", "IDEA")).toBe(false);
  });

  test("ARCHIVED is terminal — no legal transition out of it", () => {
    for (const status of Object.values(MARKETING_CONTENT_STATUSES)) {
      expect(isValidTransition("ARCHIVED", status)).toBe(false);
    }
  });

  test("a target status outside the known enum is never valid, regardless of source", () => {
    for (const from of Object.keys(MARKETING_TRANSITIONS)) {
      expect(isValidTransition(from, "NOT_REAL")).toBe(false);
    }
  });

  test("every status is reachable in the transition table (no orphaned source key)", () => {
    expect(Object.keys(MARKETING_TRANSITIONS).sort()).toEqual(
      Object.values(MARKETING_CONTENT_STATUSES).sort()
    );
  });

  test("the only backward edges in the whole table are READY_FOR_REVIEW->DRAFTING and SCHEDULED->DRAFTING", () => {
    const order = [
      "IDEA",
      "DRAFTING",
      "READY_FOR_REVIEW",
      "SCHEDULED",
      "PUBLISHED",
    ];
    const backwardEdges = [];
    for (const [from, targets] of Object.entries(MARKETING_TRANSITIONS)) {
      const fromIndex = order.indexOf(from);
      if (fromIndex === -1) continue;
      for (const to of targets) {
        const toIndex = order.indexOf(to);
        if (toIndex !== -1 && toIndex < fromIndex) {
          backwardEdges.push(`${from}->${to}`);
        }
      }
    }
    expect(backwardEdges.sort()).toEqual(
      ["READY_FOR_REVIEW->DRAFTING", "SCHEDULED->DRAFTING"].sort()
    );
  });
});
