const { YusufOSError, ErrorCodes } = require("../../errors/YusufOSError");

/**
 * Origin allowlist for the Browser Broker.
 *
 * `adapter-governance.md` §2 requires allowlisted origins and failing closed when identity cannot
 * be established. This module is the only place that decides whether a page may be observed at
 * all, and it is deliberately strict:
 *
 * - the allowlist is **exact-host**, never suffix matching. `evil-github.com` and
 *   `github.com.attacker.net` must not pass a `github.com` entry;
 * - only `https:` is observable, plus `http:` on loopback for local fixtures and dev servers;
 * - a URL that does not parse is refused rather than coerced;
 * - an empty allowlist observes nothing. Enabling the broker is not the same as trusting the web.
 */

// Loopback hosts are the only place plain http is acceptable — they are the test fixtures and a
// developer's own dev server, not the public internet.
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

const ENV_ALLOWLIST = "YUSUF_OS_BROWSER_ALLOWED_ORIGINS";
const ENV_ENABLED = "YUSUF_OS_BROWSER_BROKER_ENABLED";

function brokerEnabled() {
  return String(process.env[ENV_ENABLED] || "").toLowerCase() === "true";
}

/**
 * Parses the configured allowlist into a set of exact `scheme://host[:port]` origins.
 * Anything unparseable in the configuration is dropped rather than loosely interpreted.
 */
function configuredOrigins(raw = process.env[ENV_ALLOWLIST]) {
  const entries = String(raw || "")
    .split(/[,\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const origins = new Set();
  for (const entry of entries) {
    try {
      origins.add(new URL(entry).origin);
    } catch {
      // A malformed allowlist entry is ignored. Failing closed on one bad entry
      // is safer than guessing what the operator meant.
    }
  }
  return origins;
}

function parseUrl(value) {
  try {
    return new URL(String(value));
  } catch {
    return null;
  }
}

function isLoopback(url) {
  return LOOPBACK_HOSTS.has(url.hostname);
}

/**
 * @returns {{allowed: boolean, origin: string|null, reason: string|null}}
 */
function evaluateOrigin(rawUrl, { allowlist = configuredOrigins() } = {}) {
  const url = parseUrl(rawUrl);
  if (!url) return { allowed: false, origin: null, reason: "UNPARSEABLE_URL" };

  const httpsOk = url.protocol === "https:";
  const localHttpOk = url.protocol === "http:" && isLoopback(url);
  if (!httpsOk && !localHttpOk)
    return { allowed: false, origin: url.origin, reason: "INSECURE_SCHEME" };

  // Exact origin match only. `new URL().origin` already normalizes host case and
  // default ports, so this cannot be tricked by `HTTPS://GitHub.com:443`.
  if (!allowlist.has(url.origin))
    return { allowed: false, origin: url.origin, reason: "ORIGIN_NOT_ALLOWED" };

  return { allowed: true, origin: url.origin, reason: null };
}

function assertOriginAllowed(rawUrl, options) {
  const verdict = evaluateOrigin(rawUrl, options);
  if (verdict.allowed) return verdict;
  throw new YusufOSError(
    ErrorCodes.POLICY_DENIED,
    "This origin is not observable by the Yusuf OS Browser Broker.",
    { status: 403, details: { reason: verdict.reason, origin: verdict.origin } }
  );
}

/**
 * A URL safe to record and show: origin plus path only.
 *
 * Query strings and fragments routinely carry session ids, reset tokens, search terms and
 * personal identifiers. None of that belongs in an Agent's context, an audit row, or the
 * Command Center, so it is dropped at the boundary rather than redacted later.
 */
function safeUrl(rawUrl) {
  const url = parseUrl(rawUrl);
  if (!url) return null;
  return `${url.origin}${url.pathname}`;
}

module.exports = {
  ENV_ALLOWLIST,
  ENV_ENABLED,
  LOOPBACK_HOSTS,
  brokerEnabled,
  configuredOrigins,
  evaluateOrigin,
  assertOriginAllowed,
  safeUrl,
};
