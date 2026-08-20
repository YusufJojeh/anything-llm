const { CONFIDENCE, PROVIDER_KINDS, ROUTING_POLICIES } = require("./constants");
const { OllamaProvider } = require("./OllamaProvider");
const { OpenAIProvider } = require("./OpenAIProvider");
const { YusufOSError, ErrorCodes } = require("../errors/YusufOSError");

/**
 * Provider-neutral model router. Model routing is *not* a governed side
 * effect (see ARCHITECTURE_INVARIANTS.md) — this class never touches
 * PolicyEngine/ApprovalService/ExecutionCoordinator. It only decides which
 * provider/model serves a completion request and records what actually
 * happened, so the caller (AgentRunCoordinator) can persist honest
 * telemetry on the AgentRun.
 *
 * Ground-truth discipline: every field on the returned envelope
 * (provider/model/usage/cost) is taken from what the *router itself*
 * observed from the provider response — never from anything the model's
 * own text claims. A provider cannot lie about which provider/model served
 * a call because the router, not the response body content, decides that.
 */
class ModelRouter {
  constructor({ ollama, openai } = {}) {
    this.ollama = ollama || new OllamaProvider();
    this.openai = openai || new OpenAIProvider();
  }

  /**
   * Resolves an ordered attempt list of {provider, kind, model} for a given
   * policy. Deterministic and side-effect free except for the Ollama health
   * check needed to know which models are actually installed.
   */
  async _resolveAttempts(policy, { model, ollamaHealth } = {}) {
    const health = ollamaHealth || (await this.ollama.health());
    const ollamaAvailable =
      health.available &&
      (!model || this.ollama.isModelInstalled(health.models, model));
    const ollamaModel = model || health.models[0]?.fullName || null;
    const openaiAvailable = this.openai.hasApiKey();

    const ollamaAttempt = {
      kind: PROVIDER_KINDS.OLLAMA,
      provider: this.ollama,
      model: ollamaModel,
      available: ollamaAvailable && Boolean(ollamaModel),
    };
    const openaiAttempt = {
      kind: PROVIDER_KINDS.OPENAI,
      provider: this.openai,
      model: model || undefined,
      available: openaiAvailable,
    };

    switch (policy) {
      case ROUTING_POLICIES.LOCAL_ONLY:
        return [ollamaAttempt];
      case ROUTING_POLICIES.OPENAI_FIRST:
        return [openaiAttempt, ollamaAttempt];
      case ROUTING_POLICIES.EXPLICIT_MODEL: {
        // Whichever provider actually has the requested model/key.
        if (ollamaAttempt.available) return [ollamaAttempt];
        return [openaiAttempt];
      }
      case ROUTING_POLICIES.FALLBACK_CHAIN:
      case ROUTING_POLICIES.LOCAL_FIRST:
      default:
        return [ollamaAttempt, openaiAttempt];
    }
  }

  /**
   * Routes a completion. Never throws for provider unavailability that a
   * later attempt in the chain can serve; throws only when every eligible
   * attempt failed or the policy has no eligible attempt at all.
   */
  async route({
    policy = ROUTING_POLICIES.FALLBACK_CHAIN,
    model,
    messages,
    temperature = 0,
  }) {
    if (!Object.values(ROUTING_POLICIES).includes(policy))
      throw new YusufOSError(
        ErrorCodes.VALIDATION_ERROR,
        `Unknown routing policy: ${policy}`,
        { status: 422 }
      );

    const attempts = await this._resolveAttempts(policy, { model });
    const eligible = attempts.filter((a) => a.available);
    const attemptedKinds = [];
    const errors = [];

    // FALLBACK_CHAIN (and any multi-attempt policy) must never retry a
    // provider kind it already tried, even if resolution logic somehow
    // listed it twice.
    for (const attempt of eligible) {
      if (attemptedKinds.includes(attempt.kind)) continue;
      attemptedKinds.push(attempt.kind);
      try {
        const result = await attempt.provider.complete({
          model: attempt.model,
          messages,
          temperature,
        });
        return {
          content: result.content,
          provider: result.provider,
          model: result.model,
          policy,
          fallbackOccurred: attemptedKinds.length > 1,
          latencyMs: result.latencyMs,
          usage: result.usage || { confidence: CONFIDENCE.UNAVAILABLE },
          cost: result.cost || {
            confidence: CONFIDENCE.UNAVAILABLE,
            amountMicros: null,
          },
        };
      } catch (error) {
        errors.push({
          kind: attempt.kind,
          message: String(error?.message || error),
          code: error?.code,
        });
        // LOCAL_ONLY must never fall through to OpenAI even under a
        // simulated Ollama failure — enforced structurally: LOCAL_ONLY's
        // attempt list contains only the Ollama attempt, so there is
        // nothing else to try. No special-case branch needed here.
      }
    }

    throw new YusufOSError(
      ErrorCodes.MODEL_UNAVAILABLE,
      "No eligible model provider could serve this completion.",
      { status: 503, details: { policy, attempted: attemptedKinds, errors } }
    );
  }

  describe() {
    return {
      ollamaBaseUrl: this.ollama.baseUrl,
      openaiConfigured: this.openai.hasApiKey(),
    };
  }
}

module.exports = { ModelRouter, ROUTING_POLICIES, PROVIDER_KINDS, CONFIDENCE };
