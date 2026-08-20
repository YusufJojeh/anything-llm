const {
  CONFIDENCE,
  PROVIDER_KINDS,
  OPENAI_DEFAULT_TIMEOUT_MS,
  OPENAI_DEFAULT_MODEL,
} = require("./constants");

// Rough per-model pricing table, informational only — never influences
// Policy/Approval. Missing entries yield UNAVAILABLE cost, never 0.
const PRICE_MICROS_PER_TOKEN = Object.freeze({
  "gpt-4o-mini": { prompt: 0.15, completion: 0.6 }, // micros/token approximations
});

/**
 * OpenAI adapter. Reads the key from process.env.OPENAI_API_KEY only — no
 * fallback to any other env var name used elsewhere in this repo. The key
 * is read once at call time, used only for the Authorization header, and is
 * never returned, logged, or placed into any object this router persists,
 * audits, or renders.
 */
class OpenAIProvider {
  constructor({
    timeoutMs = OPENAI_DEFAULT_TIMEOUT_MS,
    fetchImpl = globalThis.fetch,
    apiKeyProvider = () => process.env.OPENAI_API_KEY || null,
  } = {}) {
    this.kind = PROVIDER_KINDS.OPENAI;
    this.timeoutMs = timeoutMs;
    this.fetchImpl = fetchImpl;
    this._apiKeyProvider = apiKeyProvider;
  }

  hasApiKey() {
    return Boolean(this._apiKeyProvider());
  }

  async health() {
    return {
      status: this.hasApiKey() ? "CONFIGURED" : "MISSING_KEY",
      available: this.hasApiKey(),
    };
  }

  async complete({ model = OPENAI_DEFAULT_MODEL, messages, temperature = 0 }) {
    const apiKey = this._apiKeyProvider();
    if (!apiKey) {
      const error = new Error("OPENAI_API_KEY is not set.");
      error.code = "MISSING_KEY";
      throw error;
    }
    if (!this.fetchImpl) {
      const error = new Error(
        "No fetch implementation available for OpenAI provider."
      );
      error.code = "NO_TRANSPORT";
      throw error;
    }
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res;
    try {
      res = await this.fetchImpl("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          // Never persisted/logged past this call; the value itself never
          // appears in any returned object below.
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, messages, temperature }),
      });
    } catch (error) {
      clearTimeout(timer);
      const wrapped = new Error(
        error?.name === "AbortError"
          ? "OpenAI request timed out."
          : `OpenAI request failed: ${error.message}`
      );
      wrapped.code = error?.name === "AbortError" ? "TIMEOUT" : "NETWORK";
      throw wrapped;
    }
    clearTimeout(timer);
    const latencyMs = Date.now() - started;

    if (!res.ok) {
      let bodyText = "";
      try {
        bodyText = await res.text();
      } catch {
        /* ignore */
      }
      const error = new Error(
        `OpenAI API error (${res.status}): ${bodyText.slice(0, 200)}`
      );
      error.code =
        res.status === 401
          ? "AUTH_FAILED"
          : res.status === 429
            ? "RATE_LIMITED"
            : res.status === 404
              ? "MODEL_UNAVAILABLE"
              : "API_ERROR";
      error.status = res.status;
      throw error;
    }

    let json;
    try {
      json = await res.json();
    } catch {
      const error = new Error("OpenAI returned a malformed response.");
      error.code = "MALFORMED_RESPONSE";
      throw error;
    }

    const content = json?.choices?.[0]?.message?.content;
    const usage = json?.usage;
    const promptTokens = Number.isFinite(usage?.prompt_tokens)
      ? usage.prompt_tokens
      : null;
    const completionTokens = Number.isFinite(usage?.completion_tokens)
      ? usage.completion_tokens
      : null;
    const priced = PRICE_MICROS_PER_TOKEN[model];
    const cost =
      priced && promptTokens !== null && completionTokens !== null
        ? {
            confidence: CONFIDENCE.ESTIMATED,
            amountMicros: Math.round(
              promptTokens * priced.prompt +
                completionTokens * priced.completion
            ),
          }
        : { confidence: CONFIDENCE.UNAVAILABLE, amountMicros: null };

    return {
      content: typeof content === "string" ? content : "",
      provider: PROVIDER_KINDS.OPENAI,
      // Ground truth for which model actually served the call: OpenAI echoes
      // this back on `json.model`; fall back to the requested id only if the
      // provider omitted it, but never let a caller override this value.
      model: typeof json?.model === "string" && json.model ? json.model : model,
      latencyMs,
      usage:
        promptTokens !== null && completionTokens !== null
          ? {
              confidence: CONFIDENCE.KNOWN,
              promptTokens,
              completionTokens,
              totalTokens: Number.isFinite(usage?.total_tokens)
                ? usage.total_tokens
                : promptTokens + completionTokens,
            }
          : { confidence: CONFIDENCE.UNAVAILABLE },
      cost,
    };
  }
}

module.exports = { OpenAIProvider };
