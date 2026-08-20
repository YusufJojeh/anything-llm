const {
  CONFIDENCE,
  PROVIDER_KINDS,
  PROVIDER_HEALTH,
  OLLAMA_DEFAULT_BASE_URL,
  OLLAMA_DEFAULT_TIMEOUT_MS,
} = require("./constants");

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
    fetchImpl = globalThis.fetch,
  } = {}) {
    this.kind = PROVIDER_KINDS.OLLAMA;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.timeoutMs = timeoutMs;
    this.fetchImpl = fetchImpl;
  }

  async _fetchJson(path, { method = "GET", body } = {}) {
    if (!this.fetchImpl)
      return {
        ok: false,
        health: PROVIDER_HEALTH.UNREACHABLE,
        error: "no fetch implementation available",
      };
    const controller = new AbortController();
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
      let json;
      try {
        json = await res.json();
      } catch {
        return {
          ok: false,
          health: PROVIDER_HEALTH.ERROR,
          error: "malformed JSON response",
        };
      }
      return { ok: true, json };
    } catch (error) {
      const health =
        error?.name === "AbortError"
          ? PROVIDER_HEALTH.TIMEOUT
          : PROVIDER_HEALTH.UNREACHABLE;
      return { ok: false, health, error: String(error?.message || error) };
    } finally {
      clearTimeout(timer);
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
      return { fullName, metadata: null, confidence: CONFIDENCE.UNAVAILABLE };
    return {
      fullName,
      metadata: result.json,
      confidence: CONFIDENCE.KNOWN,
    };
  }

  /**
   * Generates a completion from an installed model only. Ollama never
   * fabricates a monetary cost — cost is always UNAVAILABLE for this
   * provider by construction; usage tokens are KNOWN when the daemon
   * reports eval counts, else UNAVAILABLE (never coerced to 0).
   */
  async complete({ model, messages, temperature = 0 }) {
    const started = Date.now();
    const result = await this._fetchJson("/api/generate", {
      method: "POST",
      body: {
        model,
        prompt: messages.map((m) => `${m.role}: ${m.content}`).join("\n"),
        stream: false,
        options: { temperature },
      },
    });
    const latencyMs = Date.now() - started;
    if (!result.ok) {
      const error = new Error(`Ollama completion failed: ${result.error}`);
      error.providerHealth = result.health;
      throw error;
    }
    const json = result.json || {};
    const promptTokens = Number.isFinite(json.prompt_eval_count)
      ? json.prompt_eval_count
      : null;
    const completionTokens = Number.isFinite(json.eval_count)
      ? json.eval_count
      : null;
    return {
      content: typeof json.response === "string" ? json.response : "",
      provider: PROVIDER_KINDS.OLLAMA,
      model,
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
