const {
  CONFIDENCE,
  PROVIDER_KINDS,
  OPENAI_DEFAULT_TIMEOUT_MS,
  OPENAI_DEFAULT_MODEL,
} = require("./constants");
const { MODEL_SUPPORT } = require("./ModelCapabilities");
const { readLimitedJson, readLimitedText } = require("./limitedResponse");

const MAX_COMPLETION_RESPONSE_BYTES = 128 * 1024;
const MAX_ERROR_RESPONSE_BYTES = 8 * 1024;

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

  estimateMaximumCostMicros({
    model = OPENAI_DEFAULT_MODEL,
    promptTokens,
    maxCompletionTokens,
  }) {
    const priced = PRICE_MICROS_PER_TOKEN[model];
    if (
      !priced ||
      !Number.isSafeInteger(promptTokens) ||
      !Number.isSafeInteger(maxCompletionTokens) ||
      promptTokens < 0 ||
      maxCompletionTokens < 0
    )
      return null;
    return Math.ceil(
      promptTokens * priced.prompt + maxCompletionTokens * priced.completion
    );
  }

  describeModel(model = OPENAI_DEFAULT_MODEL) {
    // OpenAI does not expose a model-capability discovery endpoint. Keep the
    // small default profile explicit and allow operators to supply profiles
    // for configurable IDs; missing metadata remains UNKNOWN and is refused.
    const configured = process.env.YUSUF_OS_OPENAI_MODEL_CAPABILITIES;
    let profiles = {};
    if (configured) {
      try {
        profiles = JSON.parse(configured);
      } catch {
        profiles = {};
      }
    }
    const builtIn =
      model === OPENAI_DEFAULT_MODEL
        ? {
            text: true,
            vision: true,
            structured_output: true,
            tool_reasoning: true,
            reasoning: false,
            contextLength: 128000,
          }
        : profiles[model];
    const value = builtIn || {};
    const normalized = (key) =>
      value[key] === true
        ? MODEL_SUPPORT.SUPPORTED
        : value[key] === false
          ? MODEL_SUPPORT.UNSUPPORTED
          : MODEL_SUPPORT.UNKNOWN;
    return {
      fullName: model,
      profile: {
        capabilities: {
          text: normalized("text"),
          vision: normalized("vision"),
          structured_output: normalized("structured_output"),
          tool_reasoning: normalized("tool_reasoning"),
          reasoning: normalized("reasoning"),
        },
        contextLength: Number.isFinite(Number(value.contextLength))
          ? Number(value.contextLength)
          : null,
      },
      confidence: builtIn ? CONFIDENCE.KNOWN : CONFIDENCE.UNAVAILABLE,
    };
  }

  async health() {
    return {
      status: this.hasApiKey() ? "CONFIGURED" : "MISSING_KEY",
      available: this.hasApiKey(),
    };
  }

  async complete({
    model = OPENAI_DEFAULT_MODEL,
    messages,
    temperature = 0,
    structuredOutput = false,
    maxCompletionTokens,
    signal,
  }) {
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
    const abortFromCaller = () => controller.abort();
    if (signal?.aborted) controller.abort();
    else signal?.addEventListener("abort", abortFromCaller, { once: true });
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
        body: JSON.stringify({
          model,
          messages,
          temperature,
          response_format: structuredOutput
            ? { type: "json_object" }
            : undefined,
          max_tokens: Number.isInteger(maxCompletionTokens)
            ? maxCompletionTokens
            : undefined,
        }),
      });
    } catch (error) {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abortFromCaller);
      const wrapped = new Error(
        error?.name === "AbortError"
          ? "OpenAI request timed out."
          : `OpenAI request failed: ${error.message}`
      );
      wrapped.code = error?.name === "AbortError" ? "TIMEOUT" : "NETWORK";
      throw wrapped;
    }
    const latencyMs = Date.now() - started;
    try {
      if (!res.ok) {
        let bodyText = "";
        try {
          bodyText = await readLimitedText(res, MAX_ERROR_RESPONSE_BYTES, {
            signal: controller.signal,
          });
        } catch {
          /* keep the bounded provider error below */
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
        json = await readLimitedJson(res, MAX_COMPLETION_RESPONSE_BYTES, {
          signal: controller.signal,
        });
      } catch (cause) {
        const error = new Error(
          controller.signal.aborted
            ? "OpenAI response reading timed out."
            : "OpenAI returned a malformed response."
        );
        error.code = controller.signal.aborted
          ? "TIMEOUT"
          : cause?.code || "MALFORMED_RESPONSE";
        throw error;
      }

      const content = json?.choices?.[0]?.message?.content;
      const usage = json?.usage;
      const promptTokens =
        Number.isSafeInteger(usage?.prompt_tokens) && usage.prompt_tokens >= 0
          ? usage.prompt_tokens
          : null;
      const completionTokens =
        Number.isSafeInteger(usage?.completion_tokens) &&
        usage.completion_tokens >= 0
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
        model:
          typeof json?.model === "string" && json.model ? json.model : model,
        latencyMs,
        usage:
          promptTokens !== null && completionTokens !== null
            ? {
                confidence: CONFIDENCE.KNOWN,
                promptTokens,
                completionTokens,
                totalTokens: promptTokens + completionTokens,
              }
            : { confidence: CONFIDENCE.UNAVAILABLE },
        cost,
      };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abortFromCaller);
    }
  }
}

module.exports = { OpenAIProvider };
