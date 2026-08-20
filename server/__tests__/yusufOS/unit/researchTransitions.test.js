const {
  isValidTransition,
  RESEARCH_TRANSITIONS,
} = require("../../../domain/yusufOS/research/transitions");
const {
  RESEARCH_ITEM_STATUSES,
} = require("../../../domain/yusufOS/constants");

describe("Phase O — research/transitions", () => {
  test("OPEN may move to INVESTIGATING or ABANDONED, nothing else", () => {
    expect(isValidTransition("OPEN", "INVESTIGATING")).toBe(true);
    expect(isValidTransition("OPEN", "ABANDONED")).toBe(true);
    expect(isValidTransition("OPEN", "ANSWERED")).toBe(false);
  });

  test("INVESTIGATING may move to ANSWERED or ABANDONED, nothing else", () => {
    expect(isValidTransition("INVESTIGATING", "ANSWERED")).toBe(true);
    expect(isValidTransition("INVESTIGATING", "ABANDONED")).toBe(true);
    expect(isValidTransition("INVESTIGATING", "OPEN")).toBe(false);
  });

  test("ANSWERED may reopen to INVESTIGATING or move to ABANDONED — the one backward/reopening edge", () => {
    expect(isValidTransition("ANSWERED", "INVESTIGATING")).toBe(true);
    expect(isValidTransition("ANSWERED", "ABANDONED")).toBe(true);
    expect(isValidTransition("ANSWERED", "OPEN")).toBe(false);
  });

  test("ABANDONED is terminal — no legal transition out of it", () => {
    for (const status of Object.values(RESEARCH_ITEM_STATUSES)) {
      expect(isValidTransition("ABANDONED", status)).toBe(false);
    }
  });

  test("a target status outside the known enum is never valid, regardless of source", () => {
    for (const from of Object.keys(RESEARCH_TRANSITIONS)) {
      expect(isValidTransition(from, "NOT_REAL")).toBe(false);
    }
  });

  test("an unknown source status is never valid", () => {
    expect(isValidTransition("NOT_REAL", "OPEN")).toBe(false);
  });

  test("every status is reachable in the transition table (no orphaned source key)", () => {
    expect(Object.keys(RESEARCH_TRANSITIONS).sort()).toEqual(
      Object.values(RESEARCH_ITEM_STATUSES).sort()
    );
  });

  test("the only backward/reopening edge is ANSWERED->INVESTIGATING", () => {
    // Unlike Career/Marketing/Founder, Research's pipeline is a simple chain
    // (OPEN -> INVESTIGATING -> ANSWERED) with ABANDONED as a terminal
    // off-ramp from every non-terminal state. The single edge that moves to
    // an earlier stage in that chain is ANSWERED -> INVESTIGATING.
    const mainPipelineOrder = ["OPEN", "INVESTIGATING", "ANSWERED"];
    const backwardEdges = [];
    for (const [from, targets] of Object.entries(RESEARCH_TRANSITIONS)) {
      const fromIndex = mainPipelineOrder.indexOf(from);
      if (fromIndex === -1) continue;
      for (const to of targets) {
        const toIndex = mainPipelineOrder.indexOf(to);
        if (toIndex !== -1 && toIndex < fromIndex)
          backwardEdges.push(`${from}->${to}`);
      }
    }
    expect(backwardEdges).toEqual(["ANSWERED->INVESTIGATING"]);
  });
});
