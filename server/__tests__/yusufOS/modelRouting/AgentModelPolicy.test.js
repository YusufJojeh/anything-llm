const {
  resolveAgentModelPolicy,
} = require("../../../domain/yusufOS/models/AgentModelPolicy");
const {
  REVIEWER,
  CHIEF_OF_STAFF,
  ENGINEERING,
} = require("../../../domain/yusufOS/agents/definitions");
const { AUTONOMY_LEVELS } = require("../../../domain/yusufOS/constants");

describe("OpenAI commissioning (2026-09-06) — Chief of Staff routing", () => {
  test("Chief of Staff resolves to OPENAI_FIRST by default — every voice/text command originates here and must not silently depend on a local Ollama model being installed", () => {
    expect(resolveAgentModelPolicy(CHIEF_OF_STAFF, {})).toMatchObject({
      routingPolicy: "OPENAI_FIRST",
      explicitProvider: null,
      explicitModel: null,
    });
  });

  test("operator env can still override Chief of Staff's routing policy, same mechanism as every other Agent", () => {
    expect(
      resolveAgentModelPolicy(CHIEF_OF_STAFF, {
        YUSUF_OS_CHIEF_OF_STAFF_MODEL_ROUTING_POLICY: "LOCAL_ONLY",
      })
    ).toMatchObject({ routingPolicy: "LOCAL_ONLY" });
  });

  test("the routing change did not touch Chief of Staff's authority: still zero capabilities, still SUPERVISED", () => {
    expect(CHIEF_OF_STAFF.allowedCapabilities).toEqual([]);
    expect(CHIEF_OF_STAFF.autonomyLevel).toBe(AUTONOMY_LEVELS.SUPERVISED);
  });

  test("Engineering's own routing policy is untouched by this commissioning change", () => {
    expect(ENGINEERING.modelPolicy.routingPolicy).toBe("FALLBACK_CHAIN");
  });
});

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
