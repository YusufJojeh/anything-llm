const {
  AgentDecision,
  MAX_DECISION_BYTES,
} = require("../../../domain/yusufOS/agents/contracts");

describe("Phase T — strict Agent decision contract", () => {
  test("accepts each closed decision shape", () => {
    expect(
      AgentDecision({
        type: "CALL_CAPABILITY",
        capability: "career.read_opportunities",
        arguments: {},
        reason: "Inspect current opportunities.",
        expectedOutcome: "A bounded list.",
      })
    ).toMatchObject({ type: "CALL_CAPABILITY" });
    expect(
      AgentDecision({
        type: "HANDOFF",
        targetAgent: "research",
        reason: "Research is required.",
      })
    ).toMatchObject({ type: "HANDOFF" });
    expect(
      AgentDecision({
        type: "COMPLETE",
        summary: "Turn finished.",
        evidenceRefs: [],
      })
    ).toMatchObject({ type: "COMPLETE" });
    expect(
      AgentDecision({ type: "WAIT_FOR_USER", reason: "Need a choice." })
    ).toMatchObject({ type: "WAIT_FOR_USER" });
    expect(
      AgentDecision({
        type: "REVIEW_VERDICT",
        verdict: "PASS",
        summary: "Reviewed.",
        findings: [],
      })
    ).toMatchObject({ type: "REVIEW_VERDICT", verdict: "PASS" });
  });

  test.each([
    "```json\n{\"type\":\"WAIT_FOR_USER\",\"reason\":\"x\"}\n```",
    { type: "EXECUTE_SHELL", command: "whoami" },
    {
      type: "COMPLETE",
      summary: "done",
      evidenceRefs: [],
      completed: true,
    },
    {
      type: "COMPLETE",
      summary: "done",
      evidenceRefs: null,
    },
    {
      type: "CALL_CAPABILITY",
      capability: "career.read_opportunities",
      arguments: { approved: true },
      reason: "x",
      expectedOutcome: "x",
    },
    {
      type: "WAIT_FOR_USER",
      reason: "x",
      unexpected: "field",
    },
  ])("refuses malformed, extended, or authority-bearing output", (raw) => {
    expect(() => AgentDecision(raw)).toThrow();
  });

  test("refuses oversized and structurally hostile output before dispatch", () => {
    expect(() => AgentDecision("x".repeat(MAX_DECISION_BYTES + 1))).toThrow(
      /maximum decision size/i
    );
    expect(() =>
      AgentDecision({
        type: "WAIT_FOR_USER",
        reason: "x".repeat(MAX_DECISION_BYTES + 1),
      })
    ).toThrow(/maximum decision size/i);
    let nested = { value: "leaf" };
    for (let index = 0; index < 25; index += 1) nested = { nested };
    expect(() =>
      AgentDecision({
        type: "CALL_CAPABILITY",
        capability: "career.read_opportunities",
        arguments: nested,
        reason: "x",
        expectedOutcome: "x",
      })
    ).toThrow(/complexity limit/i);
    expect(() =>
      AgentDecision({
        type: "CALL_CAPABILITY",
        capability: "career.read_opportunities",
        arguments: { values: Array.from({ length: 201 }, () => "x") },
        reason: "x",
        expectedOutcome: "x",
      })
    ).toThrow(/oversized object or array/i);
  });
});
