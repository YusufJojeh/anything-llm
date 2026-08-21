const {
  resolveAgentModelPolicy,
} = require("../../../domain/yusufOS/models/AgentModelPolicy");
const {
  REVIEWER,
} = require("../../../domain/yusufOS/agents/definitions");

describe("Phase T — production Agent model policy", () => {
  test("operator env can pin the Reviewer to an independent provider/model", () => {
    expect(
      resolveAgentModelPolicy(REVIEWER, {
        YUSUF_OS_REVIEWER_MODEL_PROVIDER: "OPENAI",
        YUSUF_OS_REVIEWER_MODEL_ID: "gpt-4o-mini",
      })
    ).toMatchObject({
      routingPolicy: "EXPLICIT_MODEL",
      explicitProvider: "OPENAI",
      explicitModel: "gpt-4o-mini",
    });
  });

  test("invalid provider and routing config fail closed", () => {
    expect(() =>
      resolveAgentModelPolicy(REVIEWER, {
        YUSUF_OS_REVIEWER_MODEL_PROVIDER: "SPOOFED",
      })
    ).toThrow(/OLLAMA or OPENAI/);
    expect(() =>
      resolveAgentModelPolicy(REVIEWER, {
        YUSUF_OS_REVIEWER_MODEL_ROUTING_POLICY: "WHATEVER",
      })
    ).toThrow(/not supported/);
  });
});
