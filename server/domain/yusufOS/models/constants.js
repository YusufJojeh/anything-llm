// Phase R. Provider-neutral model routing vocabulary. Deliberately separate
// from the security PolicyEngine's POLICY_OUTCOMES/RISK_LEVELS in
// ../constants.js — model routing is not a governed side effect and must
// never be confused with capability authorization.

// Tri-state confidence for anything the router cannot *directly observe*.
// This vocabulary does not exist elsewhere in the codebase as of Phase R —
// defined once here and reused throughout ModelRouter/providers/tests.
// KNOWN: the provider itself reported the value (e.g. Ollama returned
//   eval_count, OpenAI returned usage.total_tokens).
// ESTIMATED: derived indirectly (e.g. a rough token estimate from text
//   length) and must be labeled as such wherever rendered.
// UNAVAILABLE: genuinely not known. Never coerced to 0 or any other numeric
// placeholder — grep the codebase for `|| 0` near cost/usage fields before
// touching this again.
const CONFIDENCE = Object.freeze({
  KNOWN: "KNOWN",
  ESTIMATED: "ESTIMATED",
  UNAVAILABLE: "UNAVAILABLE",
});

const PROVIDER_KINDS = Object.freeze({
  OLLAMA: "OLLAMA",
  OPENAI: "OPENAI",
});

// Deterministic routing policies. Each policy is a pure function of
// (available providers, requested model) -> ordered provider attempt list.
// They do not consult PolicyEngine/ApprovalService and must never be
// conflated with capability risk tiers.
const ROUTING_POLICIES = Object.freeze({
  LOCAL_ONLY: "LOCAL_ONLY",
  LOCAL_FIRST: "LOCAL_FIRST",
  OPENAI_FIRST: "OPENAI_FIRST",
  EXPLICIT_MODEL: "EXPLICIT_MODEL",
  FALLBACK_CHAIN: "FALLBACK_CHAIN",
});

const PROVIDER_HEALTH = Object.freeze({
  HEALTHY: "HEALTHY",
  UNREACHABLE: "UNREACHABLE",
  TIMEOUT: "TIMEOUT",
  ERROR: "ERROR",
});

const OLLAMA_DEFAULT_BASE_URL = "http://localhost:11434";
const OLLAMA_DEFAULT_TIMEOUT_MS = 5000;
const OPENAI_DEFAULT_TIMEOUT_MS = 30000;
const OPENAI_DEFAULT_MODEL = "gpt-4o-mini";

module.exports = {
  CONFIDENCE,
  PROVIDER_KINDS,
  ROUTING_POLICIES,
  PROVIDER_HEALTH,
  OLLAMA_DEFAULT_BASE_URL,
  OLLAMA_DEFAULT_TIMEOUT_MS,
  OPENAI_DEFAULT_TIMEOUT_MS,
  OPENAI_DEFAULT_MODEL,
};
