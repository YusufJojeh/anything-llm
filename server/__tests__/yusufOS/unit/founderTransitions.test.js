const {
  isValidTransition,
  FOUNDER_TRANSITIONS,
} = require("../../../domain/yusufOS/founder/transitions");
const {
  FOUNDER_VENTURE_STATUSES,
} = require("../../../domain/yusufOS/constants");

describe("Phase N — founder/transitions", () => {
  test("IDEA may move to VALIDATING or KILLED, nothing else", () => {
    expect(isValidTransition("IDEA", "VALIDATING")).toBe(true);
    expect(isValidTransition("IDEA", "KILLED")).toBe(true);
    expect(isValidTransition("IDEA", "BUILDING")).toBe(false);
    expect(isValidTransition("IDEA", "LAUNCHED")).toBe(false);
    expect(isValidTransition("IDEA", "PAUSED")).toBe(false);
  });

  test("VALIDATING may move to BUILDING, PAUSED, or KILLED", () => {
    expect(isValidTransition("VALIDATING", "BUILDING")).toBe(true);
    expect(isValidTransition("VALIDATING", "PAUSED")).toBe(true);
    expect(isValidTransition("VALIDATING", "KILLED")).toBe(true);
    expect(isValidTransition("VALIDATING", "LAUNCHED")).toBe(false);
    expect(isValidTransition("VALIDATING", "IDEA")).toBe(false);
  });

  test("BUILDING may move to LAUNCHED, PAUSED, or KILLED", () => {
    expect(isValidTransition("BUILDING", "LAUNCHED")).toBe(true);
    expect(isValidTransition("BUILDING", "PAUSED")).toBe(true);
    expect(isValidTransition("BUILDING", "KILLED")).toBe(true);
    expect(isValidTransition("BUILDING", "VALIDATING")).toBe(false);
  });

  test("LAUNCHED may move to PAUSED or KILLED, never back to BUILDING directly", () => {
    expect(isValidTransition("LAUNCHED", "PAUSED")).toBe(true);
    expect(isValidTransition("LAUNCHED", "KILLED")).toBe(true);
    expect(isValidTransition("LAUNCHED", "BUILDING")).toBe(false);
    expect(isValidTransition("LAUNCHED", "VALIDATING")).toBe(false);
  });

  test("PAUSED may resume to BUILDING or be KILLED — the one backward edge", () => {
    expect(isValidTransition("PAUSED", "BUILDING")).toBe(true);
    expect(isValidTransition("PAUSED", "KILLED")).toBe(true);
    expect(isValidTransition("PAUSED", "LAUNCHED")).toBe(false);
    expect(isValidTransition("PAUSED", "VALIDATING")).toBe(false);
    expect(isValidTransition("PAUSED", "IDEA")).toBe(false);
  });

  test("KILLED is terminal — no legal transition out of it", () => {
    for (const status of Object.values(FOUNDER_VENTURE_STATUSES)) {
      expect(isValidTransition("KILLED", status)).toBe(false);
    }
  });

  test("a target status outside the known enum is never valid, regardless of source", () => {
    for (const from of Object.keys(FOUNDER_TRANSITIONS)) {
      expect(isValidTransition(from, "NOT_REAL")).toBe(false);
    }
  });

  test("every status is reachable in the transition table (no orphaned source key)", () => {
    expect(Object.keys(FOUNDER_TRANSITIONS).sort()).toEqual(
      Object.values(FOUNDER_VENTURE_STATUSES).sort()
    );
  });

  test("the only edge that resumes progress toward LAUNCHED is PAUSED->BUILDING", () => {
    // The main pipeline is strictly forward (IDEA -> VALIDATING -> BUILDING ->
    // LAUNCHED); PAUSED is a resumable side-track off of VALIDATING/BUILDING/
    // LAUNCHED, not a step in that pipeline. The only edge that re-enters the
    // main pipeline at an earlier stage than some state can reach it from is
    // PAUSED -> BUILDING.
    const mainPipelineOrder = ["IDEA", "VALIDATING", "BUILDING", "LAUNCHED"];
    const resumeEdges = [];
    for (const [from, targets] of Object.entries(FOUNDER_TRANSITIONS)) {
      if (mainPipelineOrder.includes(from)) continue;
      for (const to of targets) {
        if (mainPipelineOrder.includes(to)) resumeEdges.push(`${from}->${to}`);
      }
    }
    expect(resumeEdges).toEqual(["PAUSED->BUILDING"]);
  });
});
