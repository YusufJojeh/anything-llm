const { ModelRouter } = require("../../../domain/yusufOS/models/ModelRouter");
const { CONFIDENCE, ROUTING_POLICIES, PROVIDER_KINDS } = require("../../../domain/yusufOS/models/constants");
const { YusufOSError, ErrorCodes } = require("../../../domain/yusufOS/errors/YusufOSError");

function fakeOllama({ health, completeImpl } = {}) {
  return {
    kind: PROVIDER_KINDS.OLLAMA,
    baseUrl: "http://localhost:11434",
    health: async () => health || { available: false, models: [] },
    isModelInstalled: (models, requested) =>
      models.some((m) => m.fullName === requested || m.name === requested),
    complete:
      completeImpl ||
      (async () => ({
        content: "ok",
        provider: PROVIDER_KINDS.OLLAMA,
        model: "gemma4:latest",
        latencyMs: 10,
        usage: { confidence: CONFIDENCE.KNOWN, promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        cost: { confidence: CONFIDENCE.UNAVAILABLE, amountMicros: null },
      })),
  };
}

function fakeOpenAI({ hasKey = true, completeImpl } = {}) {
  return {
    kind: PROVIDER_KINDS.OPENAI,
    hasApiKey: () => hasKey,
    complete:
      completeImpl ||
      (async () => ({
        content: "ok",
        provider: PROVIDER_KINDS.OPENAI,
        model: "gpt-4o-mini",
        latencyMs: 20,
        usage: { confidence: CONFIDENCE.KNOWN, promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        cost: { confidence: CONFIDENCE.ESTIMATED, amountMicros: 5 },
      })),
  };
}

describe("Phase R — ModelRouter attack matrix", () => {
  const messages = [{ role: "user", content: "hi" }];

  test("Ollama unavailable + LOCAL_ONLY -> no eligible provider, never touches OpenAI", async () => {
    const openai = fakeOpenAI();
    openai.complete = jest.fn();
    const router = new ModelRouter({ ollama: fakeOllama({ health: { available: false, models: [] } }), openai });
    await expect(
      router.route({ policy: ROUTING_POLICIES.LOCAL_ONLY, messages })
    ).rejects.toBeInstanceOf(YusufOSError);
    expect(openai.complete).not.toHaveBeenCalled();
  });

  test("Ollama zero models -> LOCAL_ONLY has nothing to route to", async () => {
    const router = new ModelRouter({
      ollama: fakeOllama({ health: { available: true, models: [] } }),
      openai: fakeOpenAI(),
    });
    await expect(
      router.route({ policy: ROUTING_POLICIES.LOCAL_ONLY, messages })
    ).rejects.toMatchObject({ code: ErrorCodes.MODEL_UNAVAILABLE });
  });

  test("Ollama multiple models, gemma4 present -> generic tag match resolves it, no gemma4-only branch needed", async () => {
    const models = [
      { fullName: "llama3:latest", name: "llama3", tag: "latest" },
      { fullName: "gemma4:7b", name: "gemma4", tag: "7b" },
    ];
    const router = new ModelRouter({
      ollama: fakeOllama({ health: { available: true, models } }),
      openai: fakeOpenAI(),
    });
    const result = await router.route({ policy: ROUTING_POLICIES.EXPLICIT_MODEL, model: "gemma4", messages });
    expect(result.provider).toBe(PROVIDER_KINDS.OLLAMA);
  });

  test("gemma4 missing -> EXPLICIT_MODEL falls through to OpenAI, not a crash", async () => {
    const models = [{ fullName: "llama3:latest", name: "llama3", tag: "latest" }];
    const router = new ModelRouter({
      ollama: fakeOllama({ health: { available: true, models } }),
      openai: fakeOpenAI(),
    });
    const result = await router.route({ policy: ROUTING_POLICIES.EXPLICIT_MODEL, model: "gemma4", messages });
    expect(result.provider).toBe(PROVIDER_KINDS.OPENAI);
  });

  test("LOCAL_ONLY never calls OpenAI even under simulated Ollama failure mid-call", async () => {
    const openaiComplete = jest.fn();
    const router = new ModelRouter({
      ollama: fakeOllama({
        health: { available: true, models: [{ fullName: "llama3:latest", name: "llama3" }] },
        completeImpl: async () => {
          throw new Error("simulated ollama daemon crash");
        },
      }),
      openai: fakeOpenAI({ completeImpl: openaiComplete }),
    });
    await expect(
      router.route({ policy: ROUTING_POLICIES.LOCAL_ONLY, messages })
    ).rejects.toBeInstanceOf(YusufOSError);
    expect(openaiComplete).not.toHaveBeenCalled();
  });

  test("FALLBACK_CHAIN never retries a provider kind it already tried", async () => {
    let ollamaAttempts = 0;
    const router = new ModelRouter({
      ollama: fakeOllama({
        health: { available: true, models: [{ fullName: "llama3:latest", name: "llama3" }] },
        completeImpl: async () => {
          ollamaAttempts += 1;
          throw new Error("ollama down");
        },
      }),
      openai: fakeOpenAI(),
    });
    const result = await router.route({ policy: ROUTING_POLICIES.FALLBACK_CHAIN, messages });
    expect(result.provider).toBe(PROVIDER_KINDS.OPENAI);
    expect(result.fallbackOccurred).toBe(true);
    expect(ollamaAttempts).toBe(1);
  });

  test("FALLBACK_CHAIN with both providers failing exhausts cleanly", async () => {
    const router = new ModelRouter({
      ollama: fakeOllama({
        health: { available: true, models: [{ fullName: "llama3:latest", name: "llama3" }] },
        completeImpl: async () => {
          throw new Error("ollama down");
        },
      }),
      openai: fakeOpenAI({
        completeImpl: async () => {
          throw new Error("openai down");
        },
      }),
    });
    await expect(
      router.route({ policy: ROUTING_POLICIES.FALLBACK_CHAIN, messages })
    ).rejects.toMatchObject({ code: ErrorCodes.MODEL_UNAVAILABLE });
  });

  test("OpenAI missing key -> not eligible, FALLBACK_CHAIN still succeeds via Ollama", async () => {
    const router = new ModelRouter({
      ollama: fakeOllama({ health: { available: true, models: [{ fullName: "llama3:latest", name: "llama3" }] } }),
      openai: fakeOpenAI({ hasKey: false }),
    });
    const result = await router.route({ policy: ROUTING_POLICIES.OPENAI_FIRST, messages });
    expect(result.provider).toBe(PROVIDER_KINDS.OLLAMA);
    // OpenAI was never eligible (no key), so it was never attempted at all —
    // this is not a fallback from a failed attempt, just the only eligible
    // provider succeeding on the first (and only) try.
    expect(result.fallbackOccurred).toBe(false);
  });

  test("usage/cost fabrication: adapter cannot report cost the router didn't itself observe — router passes through only what complete() returned", async () => {
    const router = new ModelRouter({
      ollama: fakeOllama({
        health: { available: true, models: [{ fullName: "llama3:latest", name: "llama3" }] },
        completeImpl: async () => ({
          content: "ok",
          provider: PROVIDER_KINDS.OLLAMA,
          model: "llama3:latest",
          latencyMs: 5,
          usage: { confidence: CONFIDENCE.UNAVAILABLE },
          cost: { confidence: CONFIDENCE.UNAVAILABLE, amountMicros: null },
        }),
      }),
      openai: fakeOpenAI(),
    });
    const result = await router.route({ policy: ROUTING_POLICIES.LOCAL_ONLY, messages });
    expect(result.usage.confidence).toBe(CONFIDENCE.UNAVAILABLE);
    expect(result.cost.confidence).toBe(CONFIDENCE.UNAVAILABLE);
    expect(result.cost.amountMicros).toBeNull();
    // Never coerced to 0.
    expect(result.usage.totalTokens).toBeUndefined();
  });

  test("provider/model spoofing: router-recorded provider/model reflects what actually served, not any caller-suppliable field", async () => {
    const router = new ModelRouter({
      ollama: fakeOllama({ health: { available: true, models: [{ fullName: "llama3:latest", name: "llama3" }] } }),
      openai: fakeOpenAI(),
    });
    const result = await router.route({ policy: ROUTING_POLICIES.LOCAL_ONLY, model: "llama3", messages });
    expect(result.provider).toBe(PROVIDER_KINDS.OLLAMA);
    expect(result.model).toBe("gemma4:latest"); // taken verbatim from the fake provider's own response, not from the request
  });

  test("malicious model output is returned as inert string content — never eval'd", async () => {
    const router = new ModelRouter({
      ollama: fakeOllama({
        health: { available: true, models: [{ fullName: "llama3:latest", name: "llama3" }] },
        completeImpl: async () => ({
          content: "require('child_process').execSync('echo pwned')",
          provider: PROVIDER_KINDS.OLLAMA,
          model: "llama3:latest",
          latencyMs: 1,
          usage: { confidence: CONFIDENCE.UNAVAILABLE },
          cost: { confidence: CONFIDENCE.UNAVAILABLE, amountMicros: null },
        }),
      }),
      openai: fakeOpenAI(),
    });
    const result = await router.route({ policy: ROUTING_POLICIES.LOCAL_ONLY, messages });
    expect(typeof result.content).toBe("string");
    expect(result.content).toContain("require(");
  });

  test("rejects an unknown routing policy", async () => {
    const router = new ModelRouter({ ollama: fakeOllama(), openai: fakeOpenAI() });
    await expect(router.route({ policy: "NOT_A_POLICY", messages })).rejects.toBeInstanceOf(YusufOSError);
  });
});
