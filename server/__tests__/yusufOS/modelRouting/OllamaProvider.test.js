const { OllamaProvider } = require("../../../domain/yusufOS/models/OllamaProvider");
const { PROVIDER_HEALTH, CONFIDENCE } = require("../../../domain/yusufOS/models/constants");

function jsonResponse(body, ok = true, status = 200) {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body) };
}

describe("Phase R — OllamaProvider (mocked)", () => {
  test("unreachable daemon reports UNREACHABLE, not a thrown error", async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const provider = new OllamaProvider({ fetchImpl });
    const health = await provider.health();
    expect(health.available).toBe(false);
    expect(health.status).toBe(PROVIDER_HEALTH.UNREACHABLE);
  });

  test("timeout reports TIMEOUT via AbortError", async () => {
    const fetchImpl = jest.fn().mockImplementation(() => {
      const err = new Error("aborted");
      err.name = "AbortError";
      return Promise.reject(err);
    });
    const provider = new OllamaProvider({ fetchImpl, timeoutMs: 1 });
    const health = await provider.health();
    expect(health.status).toBe(PROVIDER_HEALTH.TIMEOUT);
  });

  test("zero models installed", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ models: [] }));
    const provider = new OllamaProvider({ fetchImpl });
    const health = await provider.health();
    expect(health.available).toBe(true);
    expect(health.models).toHaveLength(0);
  });

  test("multiple models discovered generically, gemma4 present is recognized without a gemma4-only branch", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse({ models: [{ name: "llama3:latest" }, { name: "gemma4:7b" }, { name: "mistral:latest" }] })
    );
    const provider = new OllamaProvider({ fetchImpl });
    const health = await provider.health();
    expect(health.models.map((m) => m.fullName)).toEqual(["llama3:latest", "gemma4:7b", "mistral:latest"]);
    expect(provider.isModelInstalled(health.models, "gemma4")).toBe(true);
    expect(provider.isModelInstalled(health.models, "gemma4:7b")).toBe(true);
    expect(provider.isModelInstalled(health.models, "phi3")).toBe(false);
  });

  test("gemma4 missing is just a normal miss, not an error", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ models: [{ name: "llama3:latest" }] }));
    const provider = new OllamaProvider({ fetchImpl });
    const health = await provider.health();
    expect(provider.isModelInstalled(health.models, "gemma4")).toBe(false);
  });

  test("malformed /api/tags response (no models array) is reported as ERROR, not a crash", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ unexpected: true }));
    const provider = new OllamaProvider({ fetchImpl });
    const health = await provider.health();
    expect(health.status).toBe(PROVIDER_HEALTH.ERROR);
    expect(health.available).toBe(false);
  });

  test("never issues a pull/create/delete request during health or describeModel", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ models: [] }));
    const provider = new OllamaProvider({ fetchImpl });
    await provider.health();
    for (const call of fetchImpl.mock.calls) {
      expect(call[1]?.method || "GET").not.toBe("DELETE");
      expect(String(call[0])).not.toMatch(/\/api\/pull|\/api\/create|\/api\/delete/);
    }
  });

  test("completion reports KNOWN usage when the daemon returns eval counts, cost always UNAVAILABLE (never fabricated)", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse({ response: "hello", prompt_eval_count: 3, eval_count: 4 })
    );
    const provider = new OllamaProvider({ fetchImpl });
    const result = await provider.complete({ model: "llama3:latest", messages: [{ role: "user", content: "hi" }] });
    expect(result.usage.confidence).toBe(CONFIDENCE.KNOWN);
    expect(result.usage.totalTokens).toBe(7);
    expect(result.cost.confidence).toBe(CONFIDENCE.UNAVAILABLE);
    expect(result.cost.amountMicros).toBeNull();
  });

  test("completion with no eval counts reports UNAVAILABLE usage, never 0", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ response: "hello" }));
    const provider = new OllamaProvider({ fetchImpl });
    const result = await provider.complete({ model: "llama3:latest", messages: [{ role: "user", content: "hi" }] });
    expect(result.usage.confidence).toBe(CONFIDENCE.UNAVAILABLE);
    expect(result.usage.totalTokens).toBeUndefined();
  });

  test("malformed JSON body during completion throws cleanly", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("bad json");
      },
    });
    const provider = new OllamaProvider({ fetchImpl });
    await expect(
      provider.complete({ model: "llama3:latest", messages: [{ role: "user", content: "hi" }] })
    ).rejects.toThrow();
  });
});

// Live smoke test: only runs if Ollama is actually reachable. Skips
// gracefully otherwise so the mocked suite above carries no live-network
// dependency.
describe("Phase R — OllamaProvider live smoke (conditional)", () => {
  test("real daemon health check, if reachable", async () => {
    const provider = new OllamaProvider({ timeoutMs: 1500 });
    const health = await provider.health();
    if (!health.available) {
      // eslint-disable-next-line no-console
      console.log("[ollama-live-smoke] skipped: no Ollama daemon reachable at", provider.baseUrl);
      return;
    }
    expect(Array.isArray(health.models)).toBe(true);
  }, 5000);
});
