const {
  isValidTransition,
  INBOX_TRANSITIONS,
} = require("../../../domain/yusufOS/inbox/transitions");
const {
  INBOX_MESSAGE_STATUSES,
} = require("../../../domain/yusufOS/constants");

describe("Phase P — inbox/transitions", () => {
  test("NEW may move to TRIAGED or ARCHIVED_LOCAL, nothing else", () => {
    expect(isValidTransition("NEW", "TRIAGED")).toBe(true);
    expect(isValidTransition("NEW", "ARCHIVED_LOCAL")).toBe(true);
    expect(isValidTransition("NEW", "DRAFTED")).toBe(false);
  });

  test("TRIAGED may reclassify (self-loop), move to DRAFTED, or ARCHIVED_LOCAL", () => {
    expect(isValidTransition("TRIAGED", "TRIAGED")).toBe(true);
    expect(isValidTransition("TRIAGED", "DRAFTED")).toBe(true);
    expect(isValidTransition("TRIAGED", "ARCHIVED_LOCAL")).toBe(true);
    expect(isValidTransition("TRIAGED", "NEW")).toBe(false);
  });

  test("DRAFTED may only move to ARCHIVED_LOCAL", () => {
    expect(isValidTransition("DRAFTED", "ARCHIVED_LOCAL")).toBe(true);
    expect(isValidTransition("DRAFTED", "NEW")).toBe(false);
    expect(isValidTransition("DRAFTED", "TRIAGED")).toBe(false);
  });

  test("ARCHIVED_LOCAL is terminal — no legal transition out of it", () => {
    for (const status of Object.values(INBOX_MESSAGE_STATUSES)) {
      expect(isValidTransition("ARCHIVED_LOCAL", status)).toBe(false);
    }
  });

  test("a target status outside the known enum is never valid, regardless of source", () => {
    for (const from of Object.keys(INBOX_TRANSITIONS)) {
      expect(isValidTransition(from, "NOT_REAL")).toBe(false);
    }
  });

  test("an unknown source status is never valid", () => {
    expect(isValidTransition("NOT_REAL", "NEW")).toBe(false);
  });

  test("every status is reachable in the transition table (no orphaned source key)", () => {
    expect(Object.keys(INBOX_TRANSITIONS).sort()).toEqual(
      Object.values(INBOX_MESSAGE_STATUSES).sort()
    );
  });

  test("the only self-loop is TRIAGED->TRIAGED, and there is no true backward edge", () => {
    // Unlike Marketing/Founder/Research, Inbox's one non-strictly-forward edge
    // is a self-loop (reclassification), not a hop to an earlier stage. This
    // asserts both halves: the self-loop exists, and no edge ever moves to an
    // earlier stage in the NEW -> TRIAGED -> DRAFTED pipeline.
    const mainPipelineOrder = ["NEW", "TRIAGED", "DRAFTED"];
    const selfLoops = [];
    const trueBackwardEdges = [];
    for (const [from, targets] of Object.entries(INBOX_TRANSITIONS)) {
      const fromIndex = mainPipelineOrder.indexOf(from);
      for (const to of targets) {
        if (to === from) {
          selfLoops.push(`${from}->${to}`);
          continue;
        }
        const toIndex = mainPipelineOrder.indexOf(to);
        if (fromIndex !== -1 && toIndex !== -1 && toIndex < fromIndex)
          trueBackwardEdges.push(`${from}->${to}`);
      }
    }
    expect(selfLoops).toEqual(["TRIAGED->TRIAGED"]);
    expect(trueBackwardEdges).toEqual([]);
  });
});
