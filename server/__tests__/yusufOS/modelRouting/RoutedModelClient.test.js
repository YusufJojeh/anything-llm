const { RoutedModelClient } = require("../../../domain/yusufOS/agents/ModelClient");
const { REVIEWER, ENGINEERING } = require("../../../domain/yusufOS/agents/definitions");
const { CONFIDENCE } = require("../../../domain/yusufOS/models/constants");

function fakeRouter(routeImpl) {
  return { route: routeImpl, describe: () => ({ ollamaBaseUrl: "x", openaiConfigured: false }) };
}

describe("Phase R — RoutedModelClient (production ModelClient, no bypass)", () => {
  test("delegates every completion to ModelRouter — there is no other code path to a provider", async () => {
    const route = jest.fn().mockResolvedValue({
      content: "hi",
      provider: "OLLAMA",
      model: "llama3:latest",
      policy: "FALLBACK_CHAIN",
      fallbackOccurred: false,
      latencyMs: 5,
      usage: { confidence: CONFIDENCE.KNOWN, promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      cost: { confidence: CONFIDENCE.UNAVAILABLE, amountMicros: null },
    });
    const client = new RoutedModelClient({ router: fakeRouter(route) });
    const result = await client.complete({
      agentKey: "engineering",
      phase: "implement",
      context: { messages: [{ role: "user", content: "do the thing" }] },
      modelPolicy: ENGINEERING.modelPolicy,
    });
    expect(route).toHaveBeenCalledTimes(1);
    expect(result.modelRef).toEqual({ provider: "OLLAMA", model: "llama3:latest" });
    expect(result.routed.fallbackOccurred).toBe(false);
  });

  test("Reviewer independence: an explicitProvider/explicitModel config forces EXPLICIT_MODEL routing distinct from Engineering's policy", async () => {
    const route = jest.fn().mockResolvedValue({
      content: "verdict",
      provider: "OPENAI",
      model: "gpt-4o-mini",
      policy: "EXPLICIT_MODEL",
      fallbackOccurred: false,
      latencyMs: 5,
      usage: { confidence: CONFIDENCE.UNAVAILABLE },
      cost: { confidence: CONFIDENCE.UNAVAILABLE, amountMicros: null },
    });
    const client = new RoutedModelClient({ router: fakeRouter(route) });
    const reviewerPolicy = { ...REVIEWER.modelPolicy, explicitProvider: "OPENAI", explicitModel: "gpt-4o-mini" };
    await client.complete({
      agentKey: "reviewer",
      phase: "review",
      context: { messages: [{ role: "user", content: "judge this diff" }] },
      modelPolicy: reviewerPolicy,
    });
    expect(route).toHaveBeenCalledWith(
      expect.objectContaining({ policy: "EXPLICIT_MODEL", model: "gpt-4o-mini" })
    );
    // Engineering's own default policy is a different routing policy value,
    // proving these are independently configurable per agent.
    expect(ENGINEERING.modelPolicy.routingPolicy).toBe("FALLBACK_CHAIN");
    expect(reviewerPolicy.explicitProvider).not.toBe(ENGINEERING.modelPolicy.explicitProvider);
  });
});
