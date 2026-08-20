const {
  isValidTransition,
  CAREER_TRANSITIONS,
} = require("../../../domain/yusufOS/career/transitions");
const {
  CAREER_OPPORTUNITY_STATUSES,
} = require("../../../domain/yusufOS/constants");

describe("Phase L — career/transitions", () => {
  test("RESEARCHING may move to APPLIED or WITHDRAWN, nothing else", () => {
    expect(isValidTransition("RESEARCHING", "APPLIED")).toBe(true);
    expect(isValidTransition("RESEARCHING", "WITHDRAWN")).toBe(true);
    expect(isValidTransition("RESEARCHING", "INTERVIEWING")).toBe(false);
    expect(isValidTransition("RESEARCHING", "OFFER")).toBe(false);
    expect(isValidTransition("RESEARCHING", "REJECTED")).toBe(false);
  });

  test("APPLIED may move to INTERVIEWING, REJECTED, or WITHDRAWN", () => {
    expect(isValidTransition("APPLIED", "INTERVIEWING")).toBe(true);
    expect(isValidTransition("APPLIED", "REJECTED")).toBe(true);
    expect(isValidTransition("APPLIED", "WITHDRAWN")).toBe(true);
    expect(isValidTransition("APPLIED", "OFFER")).toBe(false);
    expect(isValidTransition("APPLIED", "RESEARCHING")).toBe(false);
  });

  test("INTERVIEWING may move to OFFER, REJECTED, or WITHDRAWN", () => {
    expect(isValidTransition("INTERVIEWING", "OFFER")).toBe(true);
    expect(isValidTransition("INTERVIEWING", "REJECTED")).toBe(true);
    expect(isValidTransition("INTERVIEWING", "WITHDRAWN")).toBe(true);
    expect(isValidTransition("INTERVIEWING", "APPLIED")).toBe(false);
  });

  test("OFFER may move to REJECTED (declined) or WITHDRAWN, never back earlier in the pipeline", () => {
    expect(isValidTransition("OFFER", "REJECTED")).toBe(true);
    expect(isValidTransition("OFFER", "WITHDRAWN")).toBe(true);
    expect(isValidTransition("OFFER", "INTERVIEWING")).toBe(false);
    expect(isValidTransition("OFFER", "APPLIED")).toBe(false);
  });

  test("REJECTED and WITHDRAWN are terminal — no legal transition out of either", () => {
    for (const status of Object.values(CAREER_OPPORTUNITY_STATUSES)) {
      expect(isValidTransition("REJECTED", status)).toBe(false);
      expect(isValidTransition("WITHDRAWN", status)).toBe(false);
    }
  });

  test("a target status outside the known enum is never valid, regardless of source", () => {
    for (const from of Object.keys(CAREER_TRANSITIONS)) {
      expect(isValidTransition(from, "NOT_REAL")).toBe(false);
    }
  });

  test("every status is reachable in the transition table (no orphaned source key)", () => {
    expect(Object.keys(CAREER_TRANSITIONS).sort()).toEqual(
      Object.values(CAREER_OPPORTUNITY_STATUSES).sort()
    );
  });
});
