const {
  ollamaProfile,
  MODEL_SUPPORT,
  supportsRequirements,
} = require("../../../domain/yusufOS/models/ModelCapabilities");
const {
  ModelRouter,
  isAllowedModelAlias,
} = require("../../../domain/yusufOS/models/ModelRouter");

describe("Phase T — model capability matching", () => {
  test("derives only advertised Ollama capabilities and context length", () => {
    const profile = ollamaProfile({
      capabilities: ["completion", "tools", "vision"],
      model_info: { "family.context_length": 32768 },
    });
    expect(profile).toEqual({
      capabilities: {
        text: MODEL_SUPPORT.SUPPORTED,
        vision: MODEL_SUPPORT.SUPPORTED,
        structured_output: MODEL_SUPPORT.SUPPORTED,
        tool_reasoning: MODEL_SUPPORT.SUPPORTED,
        reasoning: MODEL_SUPPORT.UNSUPPORTED,
      },
      contextLength: 32768,
    });
    expect(
      supportsRequirements(profile, [
        "text",
        "tool_reasoning",
        { capability: "context_length", minimum: 16000 },
      ])
    ).toBe(true);
  });

  test("UNKNOWN is not treated as supported", () => {
    const profile = ollamaProfile({ model_info: {} });
    expect(profile.capabilities.tool_reasoning).toBe(MODEL_SUPPORT.UNKNOWN);
    expect(supportsRequirements(profile, ["tool_reasoning"])).toBe(false);
  });

  test("router skips an incompatible installed model and selects a compatible one", async () => {
    const incompatible = {
      capabilities: {
        text: MODEL_SUPPORT.SUPPORTED,
        structured_output: MODEL_SUPPORT.SUPPORTED,
        tool_reasoning: MODEL_SUPPORT.UNSUPPORTED,
      },
    };
    const compatible = {
      capabilities: {
        text: MODEL_SUPPORT.SUPPORTED,
        structured_output: MODEL_SUPPORT.SUPPORTED,
        tool_reasoning: MODEL_SUPPORT.SUPPORTED,
      },
    };
    const ollama = {
      health: jest.fn().mockResolvedValue({
        available: true,
        models: [{ fullName: "plain:latest" }, { fullName: "tools:latest" }],
      }),
      describeModel: jest.fn(async (model) => ({
        fullName: model,
        profile: model.startsWith("tools") ? compatible : incompatible,
      })),
      complete: jest.fn().mockResolvedValue({
        content: "{}",
        provider: "OLLAMA",
        model: "tools:latest",
      }),
    };
    const openai = {
      hasApiKey: () => false,
      describeModel: jest.fn(),
    };
    const routed = await new ModelRouter({ ollama, openai }).route({
      policy: "LOCAL_ONLY",
      messages: [{ role: "user", content: "decide" }],
      requiredCapabilities: ["text", "structured_output", "tool_reasoning"],
    });
    expect(ollama.complete).toHaveBeenCalledWith(
      expect.objectContaining({ model: "tools:latest", structuredOutput: true })
    );
    expect(routed.model).toBe("tools:latest");
  });

  test("an explicit provider never silently crosses to the other provider", async () => {
    const ollama = {
      health: jest.fn().mockResolvedValue({
        available: true,
        models: [{ fullName: "same-name:latest" }],
      }),
      isModelInstalled: () => true,
      complete: jest.fn(),
    };
    const openai = {
      hasApiKey: () => true,
      complete: jest.fn().mockResolvedValue({
        content: "{}",
        provider: "OPENAI",
        model: "same-name:latest",
      }),
    };
    const routed = await new ModelRouter({ ollama, openai }).route({
      policy: "EXPLICIT_MODEL",
      explicitProvider: "OPENAI",
      model: "same-name:latest",
      messages: [{ role: "user", content: "decide" }],
    });
    expect(openai.complete).toHaveBeenCalledTimes(1);
    expect(ollama.complete).not.toHaveBeenCalled();
    expect(routed.provider).toBe("OPENAI");
  });

  test("malicious telemetry cannot spoof provider identity or reduce budgets", async () => {
    const ollama = {
      health: jest.fn().mockResolvedValue({
        available: true,
        models: [{ fullName: "tools:latest" }],
      }),
      complete: jest.fn().mockResolvedValue({
        content: "{}",
        provider: "OLLAMA",
        model: "tools:latest",
        usage: {
          confidence: "KNOWN",
          promptTokens: -100,
          completionTokens: 1,
          totalTokens: -99,
        },
        cost: { confidence: "ESTIMATED", amountMicros: -500 },
      }),
    };
    const openai = { hasApiKey: () => false };
    const routed = await new ModelRouter({ ollama, openai }).route({
      policy: "LOCAL_ONLY",
      messages: [{ role: "user", content: "decide" }],
    });
    expect(routed.usage).toEqual({ confidence: "UNAVAILABLE" });
    expect(routed.cost).toEqual({
      confidence: "UNAVAILABLE",
      amountMicros: null,
    });

    ollama.complete.mockResolvedValueOnce({
      content: "{}",
      provider: "OPENAI",
      model: "tools:latest",
    });
    await expect(
      new ModelRouter({ ollama, openai }).route({
        policy: "LOCAL_ONLY",
        messages: [{ role: "user", content: "decide" }],
      })
    ).rejects.toMatchObject({ code: "MODEL_UNAVAILABLE" });
  });

  test("unexpected served models fail closed; only dated OpenAI aliases are accepted", async () => {
    expect(
      isAllowedModelAlias(
        "OPENAI",
        "gpt-4o-mini",
        "gpt-4o-mini-2024-07-18"
      )
    ).toBe(true);
    expect(isAllowedModelAlias("OPENAI", "gpt-4o-mini", "other-model")).toBe(
      false
    );
    expect(isAllowedModelAlias("OLLAMA", "tools:latest", "other:latest")).toBe(
      false
    );

    const ollama = {
      health: jest.fn().mockResolvedValue({ available: false, models: [] }),
    };
    const openai = {
      hasApiKey: () => true,
      complete: jest.fn().mockResolvedValue({
        content: "{}",
        provider: "OPENAI",
        model: "unprofiled-malicious-model",
      }),
    };
    await expect(
      new ModelRouter({ ollama, openai }).route({
        policy: "OPENAI_FIRST",
        messages: [{ role: "user", content: "decide" }],
      })
    ).rejects.toMatchObject({ code: "MODEL_UNAVAILABLE" });
  });
});
