const MODEL_SUPPORT = Object.freeze({
  SUPPORTED: "SUPPORTED",
  UNSUPPORTED: "UNSUPPORTED",
  UNKNOWN: "UNKNOWN",
});

const MODEL_CAPABILITIES = Object.freeze([
  "text",
  "vision",
  "structured_output",
  "tool_reasoning",
  "reasoning",
]);

function support(value) {
  if (value === true) return MODEL_SUPPORT.SUPPORTED;
  if (value === false) return MODEL_SUPPORT.UNSUPPORTED;
  return MODEL_SUPPORT.UNKNOWN;
}

function ollamaProfile(metadata) {
  if (!metadata || typeof metadata !== "object")
    return {
      capabilities: Object.fromEntries(
        MODEL_CAPABILITIES.map((key) => [key, MODEL_SUPPORT.UNKNOWN])
      ),
      contextLength: null,
    };
  const advertised = Array.isArray(metadata.capabilities)
    ? metadata.capabilities.map((item) => String(item).toLowerCase())
    : [];
  const hasAdvertisement = Array.isArray(metadata.capabilities);
  const modelInfo =
    metadata.model_info && typeof metadata.model_info === "object"
      ? metadata.model_info
      : {};
  const contextEntry = Object.entries(modelInfo).find(
    ([key, value]) =>
      key.endsWith(".context_length") && Number.isFinite(Number(value))
  );
  const advertisedSupport = (name) =>
    hasAdvertisement
      ? support(advertised.includes(name))
      : MODEL_SUPPORT.UNKNOWN;
  const text = advertisedSupport("completion");
  return {
    capabilities: {
      text,
      vision: advertisedSupport("vision"),
      // Ollama's JSON-schema response format is a provider feature for
      // completion models. If completion itself is not advertised, support
      // remains UNKNOWN/UNSUPPORTED rather than being guessed from a name.
      structured_output: text,
      tool_reasoning: advertisedSupport("tools"),
      reasoning: advertisedSupport("thinking"),
    },
    contextLength: contextEntry ? Number(contextEntry[1]) : null,
  };
}

function supportsRequirements(profile, required = []) {
  if (!profile || !Array.isArray(required)) return required.length === 0;
  return required.every((requirement) => {
    if (typeof requirement === "string")
      return profile.capabilities?.[requirement] === MODEL_SUPPORT.SUPPORTED;
    if (
      requirement?.capability === "context_length" &&
      Number.isFinite(requirement.minimum)
    )
      return (
        Number.isFinite(profile.contextLength) &&
        profile.contextLength >= requirement.minimum
      );
    return false;
  });
}

module.exports = {
  MODEL_SUPPORT,
  MODEL_CAPABILITIES,
  ollamaProfile,
  supportsRequirements,
};
