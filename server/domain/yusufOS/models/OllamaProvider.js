const {
  CONFIDENCE,
  PROVIDER_KINDS,
  PROVIDER_HEALTH,
  OLLAMA_DEFAULT_BASE_URL,
  OLLAMA_DEFAULT_TIMEOUT_MS,
} = require("./constants");
const { ollamaProfile } = require("./ModelCapabilities");
const { readLimitedJson } = require("./limitedResponse");

const MAX_METADATA_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_COMPLETION_RESPONSE_BYTES = 128 * 1024;
const DEFAULT_MAX_COMPLETION_TOKENS = 1024;

function configuredCompletionCap(value) {
  if (value === undefined || value === null || value === "")
    return DEFAULT_MAX_COMPLETION_TOKENS;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0
    ? parsed
    : DEFAULT_MAX_COMPLETION_TOKENS;
}

/**
 * Provider-neutral adapter over a local Ollama daemon. Read-only HTTP only:
 * this class never issues a pull/create/delete request. Model discovery is
 * generic and tag-aware — it never special-cases a specific model family
 * (e.g. "gemma4") because that would silently break every other installed
 * model's handling the day a new family ships.
 */
class OllamaProvider {
  constructor({
    baseUrl = process.env.YUSUF_OS_OLLAMA_BASE_URL || OLLAMA_DEFAULT_BASE_URL,
    timeoutMs = OLLAMA_DEFAULT_TIMEOUT_MS,
    maxCompletionTokens = configuredCompletionCap(
      process.env.YUSUF_OS_OLLAMA_MAX_COMPLETION_TOKENS
    ),
    fetchImpl = globalThis.fetch,
  } = {}) {
    this.kind = PROVIDER_KINDS.OLLAMA;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.timeoutMs = timeoutMs;
    this.maxCompletionTokens = maxCompletionTokens;
    this.fetchImpl = fetchImpl;
  }

  async _fetchJson(
    path,
    {
      method = "GET",
      body,
      signal,
      maxResponseBytes = MAX_METADATA_RESPONSE_BYTES,
    } = {}
  ) {
    if (!this.fetchImpl)
      return {
        ok: false,
        health: PROVIDER_HEALTH.UNREACHABLE,
        error: "no fetch implementation available",
      };
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort();
    if (signal?.aborted) controller.abort();
    else signal?.addEventListener("abort", abortFromCaller, { once: true });
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        signal: controller.signal,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok)
        return {
          ok: false,
          health: PROVIDER_HEALTH.ERROR,
          error: `HTTP ${res.status}`,
        };
      try {
        const json = await readLimitedJson(res, maxResponseBytes, {
          signal: controller.signal,
        });
        return { ok: true, json };
      } catch (error) {
        return {
          ok: false,
          health: PROVIDER_HEALTH.ERROR,
          error:
            error?.code === "RESPONSE_TOO_LARGE"
              ? "response too large"
              : "malformed JSON response",
        };
      }
    } catch (error) {
      const health =
        error?.name === "AbortError"
          ? PROVIDER_HEALTH.TIMEOUT
          : PROVIDER_HEALTH.UNREACHABLE;
      return { ok: false, health, error: String(error?.message || error) };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abortFromCaller);
    }
  }

  /**
   * Detects the daemon and discovers every installed model. Never throws —
   * callers get a structured health result they can route around.
   */
  async health() {
    const tags = await this._fetchJson("/api/tags");
    if (!tags.ok)
      return {
        status:
          PROVIDER_HEALTH.UNREACHABLE === tags.health
            ? PROVIDER_HEALTH.UNREACHABLE
            : tags.health,
        available: false,
        models: [],
        error: tags.error,
      };
    const rawModels = Array.isArray(tags.json?.models) ? tags.json.models : [];
    if (!Array.isArray(tags.json?.models))
      return {
        status: PROVIDER_HEALTH.ERROR,
        available: false,
        models: [],
        error: "malformed /api/tags response (missing models array)",
      };
    const models = rawModels.map((m) => this._normalizeTag(m)).filter(Boolean);
    return {
      status: PROVIDER_HEALTH.HEALTHY,
      available: true,
      models,
      error: null,
    };
  }

  // Generic tag parsing: "name" and "name:tag" both resolve to
  // { name, tag, fullName }. No model-family branching of any kind.
  _normalizeTag(entry) {
    const fullName = String(entry?.name || entry?.model || "").trim();
    if (!fullName) return null;
    const [name, tag = "latest"] = fullName.split(":");
    return { fullName, name, tag, sizeBytes: entry?.size ?? null };
  }

  /** Looks up whether a requested model (with or without an explicit tag) is installed. */
  isModelInstalled(models, requested) {
    if (!requested) return false;
    if (requested.includes(":"))
      return models.some((m) => m.fullName === requested);
    // Generic base-name match: "gemma4" matches "gemma4:latest", "gemma4:7b", etc.
    return models.some((m) => m.name === requested);
  }

  /** Best-effort metadata for one model via /api/show. Never auto-pulls. */
  async describeModel(fullName) {
    const result = await this._fetchJson("/api/show", {
      method: "POST",
      body: { name: fullName },
    });
    if (!result.ok)
      return {
        fullName,
        metadata: null,
        profile: ollamaProfile(null),
        confidence: CONFIDENCE.UNAVAILABLE,
      };
    return {
      fullName,
      metadata: result.json,
      profile: ollamaProfile(result.json),
      confidence: CONFIDENCE.KNOWN,
    };
  }

  /**
   * Generates a completion from an installed model only. Ollama never
   * fabricates a monetary cost — cost is always UNAVAILABLE for this
   * provider by construction; usage tokens are KNOWN when the daemon
   * reports eval counts, else UNAVAILABLE (never coerced to 0).
   */
  async complete({
    model,
    messages,
    temperature = 0,
    structuredOutput = false,
    maxCompletionTokens,
    signal,
  }) {
    const started = Date.now();
    const result = await this._fetchJson("/api/generate", {
      method: "POST",
      body: {
        model,
        prompt: messages.map((m) => `${m.role}: ${m.content}`).join("\n"),
        stream: false,
        format: structuredOutput ? "json" : undefined,
        options: {
          temperature,
          // A run budget can span many steps; it must not become one enormous
          // local inference allocation. Keep each Ollama request bounded. A
          // non-positive value is not a smaller cap — in Ollama's own API it
          // means "unbounded" (-1) or "fill context" (-2) — so it must never
          // reach Math.min as if it were one.
          num_predict: Math.min(
            Number.isInteger(maxCompletionTokens) && maxCompletionTokens > 0
              ? maxCompletionTokens
              : this.maxCompletionTokens,
            this.maxCompletionTokens
          ),
        },
      },
      signal,
      maxResponseBytes: MAX_COMPLETION_RESPONSE_BYTES,
    });
    const latencyMs = Date.now() - started;
    if (!result.ok) {
      const error = new Error(`Ollama completion failed: ${result.error}`);
      error.providerHealth = result.health;
      throw error;
    }
    const json = result.json || {};
    const promptTokens =
      Number.isSafeInteger(json.prompt_eval_count) &&
      json.prompt_eval_count >= 0
        ? json.prompt_eval_count
        : null;
    const completionTokens =
      Number.isSafeInteger(json.eval_count) && json.eval_count >= 0
        ? json.eval_count
        : null;
    return {
      content: typeof json.response === "string" ? json.response : "",
      provider: PROVIDER_KINDS.OLLAMA,
      // Ground truth for which model actually served the call: the daemon
      // echoes this back on `json.model`; fall back to the requested id only
      // if it omitted it, but never let a caller override this value.
      model: typeof json?.model === "string" && json.model ? json.model : model,
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
      cost: { confidence: CONFIDENCE.UNAVAILABLE, amountMicros: null },
    };
  }
}

module.exports = { OllamaProvider };
