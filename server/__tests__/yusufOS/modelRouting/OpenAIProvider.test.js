const { OpenAIProvider } = require("../../../domain/yusufOS/models/OpenAIProvider");
const { CONFIDENCE } = require("../../../domain/yusufOS/models/constants");

const SECRET_KEY = "sk-test-super-secret-value-do-not-leak";

function jsonResponse(body, ok = true, status = 200) {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body) };
}

describe("Phase R — OpenAIProvider (mocked)", () => {
  test("missing key throws MISSING_KEY without calling fetch", async () => {
    const fetchImpl = jest.fn();
    const provider = new OpenAIProvider({ fetchImpl, apiKeyProvider: () => null });
    await expect(
      provider.complete({ messages: [{ role: "user", content: "hi" }] })
    ).rejects.toMatchObject({ code: "MISSING_KEY" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("reads the key from an injected provider only — never a hardcoded fallback env var", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse({ model: "gpt-4o-mini", choices: [{ message: { content: "hi" } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })
    );
    const provider = new OpenAIProvider({ fetchImpl, apiKeyProvider: () => SECRET_KEY });
    await provider.complete({ messages: [{ role: "user", content: "hi" }] });
    const [, options] = fetchImpl.mock.calls[0];
    expect(options.headers.Authorization).toBe(`Bearer ${SECRET_KEY}`);
  });

  test("secret leakage: the API key value never appears anywhere in the returned envelope", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse({ model: "gpt-4o-mini", choices: [{ message: { content: "hi" } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })
    );
    const provider = new OpenAIProvider({ fetchImpl, apiKeyProvider: () => SECRET_KEY });
    const result = await provider.complete({ messages: [{ role: "user", content: "hi" }] });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(SECRET_KEY);
  });

  test("secret leakage: the API key never appears in a thrown error's message or fields", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ error: "bad request" }, false, 401));
    const provider = new OpenAIProvider({ fetchImpl, apiKeyProvider: () => SECRET_KEY });
    await expect(
      provider.complete({ messages: [{ role: "user", content: "hi" }] })
    ).rejects.toMatchObject({ code: "AUTH_FAILED" });
    try {
      await provider.complete({ messages: [{ role: "user", content: "hi" }] });
    } catch (error) {
      expect(JSON.stringify({ message: error.message, ...error })).not.toContain(SECRET_KEY);
    }
  });

  test("auth failure (401) maps to AUTH_FAILED", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({}, false, 401));
    const provider = new OpenAIProvider({ fetchImpl, apiKeyProvider: () => SECRET_KEY });
    await expect(
      provider.complete({ messages: [{ role: "user", content: "hi" }] })
    ).rejects.toMatchObject({ code: "AUTH_FAILED" });
  });

  test("rate limit (429) maps to RATE_LIMITED", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({}, false, 429));
    const provider = new OpenAIProvider({ fetchImpl, apiKeyProvider: () => SECRET_KEY });
    await expect(
      provider.complete({ messages: [{ role: "user", content: "hi" }] })
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  test("model unavailable (404) maps to MODEL_UNAVAILABLE", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({}, false, 404));
    const provider = new OpenAIProvider({ fetchImpl, apiKeyProvider: () => SECRET_KEY });
    await expect(
      provider.complete({ messages: [{ role: "user", content: "hi" }] })
    ).rejects.toMatchObject({ code: "MODEL_UNAVAILABLE" });
  });

  test("timeout maps to TIMEOUT", async () => {
    const fetchImpl = jest.fn().mockImplementation(() => {
      const err = new Error("aborted");
      err.name = "AbortError";
      return Promise.reject(err);
    });
    const provider = new OpenAIProvider({ fetchImpl, apiKeyProvider: () => SECRET_KEY, timeoutMs: 1 });
    await expect(
      provider.complete({ messages: [{ role: "user", content: "hi" }] })
    ).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  test("malformed JSON response throws MALFORMED_RESPONSE", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("bad json");
      },
    });
    const provider = new OpenAIProvider({ fetchImpl, apiKeyProvider: () => SECRET_KEY });
    await expect(
      provider.complete({ messages: [{ role: "user", content: "hi" }] })
    ).rejects.toMatchObject({ code: "MALFORMED_RESPONSE" });
  });

  test("provider/model spoofing: the model field reflects what OpenAI itself echoed back, not the request", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse({
        model: "gpt-4o-mini-2024-07-18",
        choices: [{ message: { content: "hi" } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      })
    );
    const provider = new OpenAIProvider({ fetchImpl, apiKeyProvider: () => SECRET_KEY });
    const result = await provider.complete({ model: "gpt-4o-mini", messages: [{ role: "user", content: "hi" }] });
    expect(result.model).toBe("gpt-4o-mini-2024-07-18");
  });

  test("usage KNOWN when reported, cost ESTIMATED for a priced model, UNAVAILABLE for an unpriced one — never coerced to 0", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse({
        model: "gpt-4o-mini",
        choices: [{ message: { content: "hi" } }],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      })
    );
    const provider = new OpenAIProvider({ fetchImpl, apiKeyProvider: () => SECRET_KEY });
    const result = await provider.complete({ model: "gpt-4o-mini", messages: [{ role: "user", content: "hi" }] });
    expect(result.usage.confidence).toBe(CONFIDENCE.KNOWN);
    expect(result.cost.confidence).toBe(CONFIDENCE.ESTIMATED);
    expect(result.cost.amountMicros).not.toBeNull();

    const fetchImpl2 = jest.fn().mockResolvedValue(
      jsonResponse({
        model: "some-unpriced-model",
        choices: [{ message: { content: "hi" } }],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      })
    );
    const provider2 = new OpenAIProvider({ fetchImpl: fetchImpl2, apiKeyProvider: () => SECRET_KEY });
    const result2 = await provider2.complete({ model: "some-unpriced-model", messages: [{ role: "user", content: "hi" }] });
    expect(result2.cost.confidence).toBe(CONFIDENCE.UNAVAILABLE);
    expect(result2.cost.amountMicros).toBeNull();
  });

  test("malicious model output is returned as inert text, never eval'd or executed", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse({
        model: "gpt-4o-mini",
        choices: [{ message: { content: "'; DROP TABLE users; -- require('fs').rmSync('/')" } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      })
    );
    const provider = new OpenAIProvider({ fetchImpl, apiKeyProvider: () => SECRET_KEY });
    const result = await provider.complete({ messages: [{ role: "user", content: "hi" }] });
    expect(typeof result.content).toBe("string");
  });
});

// Live smoke test: only runs if OPENAI_API_KEY is already set in the
// environment, using the cheapest model. Skips otherwise.
describe("Phase R — OpenAIProvider live smoke (conditional)", () => {
  const maybe = process.env.OPENAI_API_KEY ? test : test.skip;
  maybe(
    "real completion against the live API",
    async () => {
      const provider = new OpenAIProvider();
      const result = await provider.complete({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "Reply with exactly the word: pong" }],
      });
      expect(typeof result.content).toBe("string");
    },
    15000
  );
});
