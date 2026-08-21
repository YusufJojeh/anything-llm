const { ROUTING_POLICIES, PROVIDER_KINDS } = require("./constants");
const { YusufOSError, ErrorCodes } = require("../errors/YusufOSError");

function envPrefix(agentKey) {
  return `YUSUF_OS_${String(agentKey).toUpperCase()}_MODEL`;
}

function hasUnsafeIdentifierChars(value) {
  return [...value].some((character) => {
    const point = character.codePointAt(0);
    return (
      point <= 0x1f ||
      (point >= 0x7f && point <= 0x9f) ||
      (point >= 0x202a && point <= 0x202e) ||
      (point >= 0x2066 && point <= 0x2069)
    );
  });
}

function boundedModelId(value, field) {
  if (value === undefined || value === null || value === "") return null;
  if (
    typeof value !== "string" ||
    value.length > 200 ||
    hasUnsafeIdentifierChars(value)
  )
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `${field} is not a valid model identifier.`,
      { status: 422 }
    );
  return value;
}

/** Operator-owned, secret-free routing that model output cannot modify. */
function resolveAgentModelPolicy(definition, env = process.env) {
  const prefix = envPrefix(definition.key);
  const configuredProvider = boundedModelId(
    env[`${prefix}_PROVIDER`],
    `${prefix}_PROVIDER`
  );
  const configuredModel = boundedModelId(env[`${prefix}_ID`], `${prefix}_ID`);
  const configuredRouting = boundedModelId(
    env[`${prefix}_ROUTING_POLICY`],
    `${prefix}_ROUTING_POLICY`
  );
  if (
    configuredProvider &&
    !Object.values(PROVIDER_KINDS).includes(configuredProvider)
  )
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `${prefix}_PROVIDER must be OLLAMA or OPENAI.`,
      { status: 422 }
    );
  if (
    configuredRouting &&
    !Object.values(ROUTING_POLICIES).includes(configuredRouting)
  )
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `${prefix}_ROUTING_POLICY is not supported.`,
      { status: 422 }
    );
  const explicitProvider =
    configuredProvider || definition.modelPolicy.explicitProvider || null;
  const explicitModel =
    configuredModel || definition.modelPolicy.explicitModel || null;
  return {
    ...definition.modelPolicy,
    routingPolicy:
      configuredRouting ||
      (explicitProvider || explicitModel
        ? ROUTING_POLICIES.EXPLICIT_MODEL
        : definition.modelPolicy.routingPolicy ||
          ROUTING_POLICIES.FALLBACK_CHAIN),
    explicitProvider,
    explicitModel,
  };
}

module.exports = { resolveAgentModelPolicy, envPrefix };
