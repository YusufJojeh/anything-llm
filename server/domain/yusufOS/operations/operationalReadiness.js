const path = require("path");
const {
  normalizeEndpoint: normalizeCdpEndpoint,
} = require("../adapters/browser/drivers/CdpBrowserDriver");

const MIN_SECRET_LENGTH = 32;

function configuredSecret(value) {
  return typeof value === "string" && value.length >= MIN_SECRET_LENGTH;
}

function configuredBoolean(value) {
  return (
    value === undefined ||
    ["true", "false"].includes(String(value).toLowerCase())
  );
}

function configuredUrl(value, { loopbackOnly = false } = {}) {
  if (!value) return true;
  try {
    const url = new URL(String(value));
    if (!["http:", "https:"].includes(url.protocol)) return false;
    if (url.username || url.password) return false;
    if (!loopbackOnly) return true;
    return ["127.0.0.1", "::1", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}

function configuredCdpEndpoint(value) {
  return !value || Boolean(normalizeCdpEndpoint(value));
}

function storageDirectory(env = process.env) {
  return env.STORAGE_DIR
    ? path.resolve(env.STORAGE_DIR)
    : path.resolve(__dirname, "../../../storage");
}

/**
 * Returns safe, operator-actionable readiness checks. It intentionally never
 * returns secret values, connection strings, or user-provided endpoint paths.
 */
function assessOperationalReadiness(env = process.env, existsSync) {
  const storagePath = storageDirectory(env);
  const checks = [
    {
      name: "audit_hmac_key",
      ok: configuredSecret(env.YUSUF_OS_AUDIT_HMAC_KEY),
      message: "YUSUF_OS_AUDIT_HMAC_KEY must be at least 32 characters.",
    },
    {
      name: "control_token",
      ok: configuredSecret(env.YUSUF_OS_CONTROL_TOKEN),
      message: "YUSUF_OS_CONTROL_TOKEN must be at least 32 characters.",
    },
    {
      name: "scheduler_flag",
      ok: configuredBoolean(env.YUSUF_OS_SCHEDULER_ENABLED),
      message: "YUSUF_OS_SCHEDULER_ENABLED must be true or false when set.",
    },
    {
      name: "ollama_endpoint",
      ok: configuredUrl(env.OLLAMA_BASE_PATH),
      message:
        "OLLAMA_BASE_PATH must be an http(s) URL without embedded credentials.",
    },
    {
      name: "browser_cdp_endpoint",
      ok: configuredCdpEndpoint(env.YUSUF_OS_BROWSER_CDP_ENDPOINT),
      message:
        "YUSUF_OS_BROWSER_CDP_ENDPOINT must be a credential-free loopback HTTP URL with no path.",
    },
    {
      name: "storage_directory",
      ok: typeof existsSync === "function" ? existsSync(storagePath) : true,
      message: "Configured storage directory must exist before startup.",
    },
  ];

  return {
    ok: checks.every((check) => check.ok),
    checks: checks.map(({ name, ok, message }) => ({ name, ok, message })),
  };
}

module.exports = {
  MIN_SECRET_LENGTH,
  configuredSecret,
  configuredUrl,
  configuredCdpEndpoint,
  storageDirectory,
  assessOperationalReadiness,
};
