const {
  CONFIDENCE,
  PROVIDER_KINDS,
  ROUTING_POLICIES,
  OPENAI_DEFAULT_MODEL,
} = require("./constants");
const { OllamaProvider } = require("./OllamaProvider");
const { OpenAIProvider } = require("./OpenAIProvider");
const { YusufOSError, ErrorCodes } = require("../errors/YusufOSError");
const { supportsRequirements } = require("./ModelCapabilities");

function nonNegativeSafeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function normalizeUsage(usage) {
  if (
    !usage ||
    ![CONFIDENCE.KNOWN, CONFIDENCE.ESTIMATED].includes(usage.confidence)
  )
    return { confidence: CONFIDENCE.UNAVAILABLE };
  const promptTokens = nonNegativeSafeInteger(usage.promptTokens);
  const completionTokens = nonNegativeSafeInteger(usage.completionTokens);
  if (promptTokens === null || completionTokens === null)
    return { confidence: CONFIDENCE.UNAVAILABLE };
  return {
    confidence: usage.confidence,
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  };
}

function normalizeCost(cost) {
  if (
    !cost ||
    ![CONFIDENCE.KNOWN, CONFIDENCE.ESTIMATED].includes(cost.confidence)
  )
    return { confidence: CONFIDENCE.UNAVAILABLE, amountMicros: null };
  const amountMicros = nonNegativeSafeInteger(cost.amountMicros);
  return amountMicros === null
    ? { confidence: CONFIDENCE.UNAVAILABLE, amountMicros: null }
    : { confidence: cost.confidence, amountMicros };
}

function providerIdentifier(value, field, max) {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new Error(`Model provider returned an invalid ${field}.`);
  const normalized = [...value]
    .filter((character) => {
      const point = character.codePointAt(0);
      return !(
        point <= 0x1f ||
        (point >= 0x7f && point <= 0x9f) ||
        (point >= 0x202a && point <= 0x202e) ||
        (point >= 0x2066 && point <= 0x2069)
      );
    })
    .join("");
  if (normalized !== value || !normalized.trim())
    throw new Error(`Model provider returned an unsafe ${field}.`);
  return normalized;
}

function isAllowedModelAlias(provider, requested, served) {
  if (!requested || requested === served) return true;
  if (provider !== PROVIDER_KINDS.OPENAI) return false;
  const escaped = requested.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped}-\\d{4}-\\d{2}-\\d{2}$`).test(served);
}

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
  async _resolveAttempts(
    policy,
    { model, explicitProvider, ollamaHealth, requiredCapabilities = [] } = {}
  ) {
    const health = ollamaHealth || (await this.ollama.health());
    let ollamaAvailable =
      health.available &&
      (!model || this.ollama.isModelInstalled(health.models, model));
    let ollamaModel = model || health.models[0]?.fullName || null;
    const openaiAvailable = this.openai.hasApiKey();

    let ollamaProfile = null;
    if (ollamaAvailable && ollamaModel && requiredCapabilities.length) {
      const candidates = model
        ? [ollamaModel]
        : health.models.map((entry) => entry.fullName);
      const descriptions = await Promise.all(
        candidates.map((candidate) => this.ollama.describeModel(candidate))
      );
      const compatible = descriptions.find((description) =>
        supportsRequirements(description.profile, requiredCapabilities)
      );
      ollamaModel = compatible?.fullName || ollamaModel;
      ollamaProfile = compatible?.profile || null;
      ollamaAvailable = Boolean(compatible);
    }
    const openaiModel = model || OPENAI_DEFAULT_MODEL;
    const openaiProfile =
      openaiAvailable && requiredCapabilities.length
        ? this.openai.describeModel(openaiModel).profile
        : null;
    const compatibleOpenAI =
      openaiAvailable &&
      supportsRequirements(openaiProfile, requiredCapabilities);

    const ollamaAttempt = {
      kind: PROVIDER_KINDS.OLLAMA,
      provider: this.ollama,
      model: ollamaModel,
      available: ollamaAvailable && Boolean(ollamaModel),
      profile: ollamaProfile,
    };
    const openaiAttempt = {
      kind: PROVIDER_KINDS.OPENAI,
      provider: this.openai,
      model: openaiModel,
      available: compatibleOpenAI,
      profile: openaiProfile,
    };

    switch (policy) {
      case ROUTING_POLICIES.LOCAL_ONLY:
        return [ollamaAttempt];
      case ROUTING_POLICIES.OPENAI_FIRST:
        return [openaiAttempt, ollamaAttempt];
      case ROUTING_POLICIES.EXPLICIT_MODEL: {
        if (explicitProvider === PROVIDER_KINDS.OLLAMA) return [ollamaAttempt];
        if (explicitProvider === PROVIDER_KINDS.OPENAI) return [openaiAttempt];
        // Backward-compatible model-only selection: whichever provider can
        // actually serve the requested identifier.
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
    explicitProvider,
    messages,
    temperature = 0,
    requiredCapabilities = [],
    maxCompletionTokens,
    signal,
    promptTokenEstimate,
    maxKnownCostMicros,
  }) {
    if (!Object.values(ROUTING_POLICIES).includes(policy))
      throw new YusufOSError(
        ErrorCodes.VALIDATION_ERROR,
        `Unknown routing policy: ${policy}`,
        { status: 422 }
      );
    if (
      explicitProvider !== undefined &&
      !Object.values(PROVIDER_KINDS).includes(explicitProvider)
    )
      throw new YusufOSError(
        ErrorCodes.VALIDATION_ERROR,
        `Unknown explicit model provider: ${explicitProvider}`,
        { status: 422 }
      );

    const attempts = await this._resolveAttempts(policy, {
      model,
      explicitProvider,
      requiredCapabilities,
    });
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
        if (
          Number.isInteger(maxKnownCostMicros) &&
          typeof attempt.provider.estimateMaximumCostMicros === "function"
        ) {
          const estimatedMaximum = attempt.provider.estimateMaximumCostMicros({
            model: attempt.model,
            promptTokens: promptTokenEstimate,
            maxCompletionTokens,
          });
          if (
            Number.isSafeInteger(estimatedMaximum) &&
            estimatedMaximum > maxKnownCostMicros
          )
            throw new Error(
              `Known model cost ceiling exceeds the remaining budget for ${attempt.kind}.`
            );
        }
        const result = await attempt.provider.complete({
          model: attempt.model,
          messages,
          temperature,
          structuredOutput: requiredCapabilities.includes("structured_output"),
          maxCompletionTokens,
          signal,
        });
        if (result.provider !== attempt.kind)
          throw new Error(
            `Model provider identity mismatch for ${attempt.kind}.`
          );
        if (typeof result.content !== "string")
          throw new Error(
            "Model provider returned invalid completion content."
          );
        const servedModel = providerIdentifier(result.model, "model id", 200);
        if (!isAllowedModelAlias(attempt.kind, attempt.model, servedModel))
          throw new Error(
            `Model provider served an unexpected model for ${attempt.kind}.`
          );
        return {
          content: result.content,
          provider: attempt.kind,
          model: servedModel,
          requestedModel: attempt.model || null,
          modelMismatch: Boolean(
            attempt.model && servedModel !== attempt.model
          ),
          policy,
          fallbackOccurred: attemptedKinds.length > 1,
          latencyMs:
            Number.isFinite(result.latencyMs) && result.latencyMs >= 0
              ? Math.round(result.latencyMs)
              : null,
          usage: normalizeUsage(result.usage),
          cost: normalizeCost(result.cost),
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

module.exports = {
  ModelRouter,
  ROUTING_POLICIES,
  PROVIDER_KINDS,
  CONFIDENCE,
  normalizeUsage,
  normalizeCost,
  isAllowedModelAlias,
};
