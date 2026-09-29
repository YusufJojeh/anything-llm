const REDACTED = "[REDACTED]";

// Same rationale as canonicalJson.js's MAX_DEPTH: bound recursion so a
// deeply-nested payload fails closed with a clean error instead of a raw
// stack-exhaustion RangeError.
const MAX_DEPTH = 64;

const SECRET_KEYS = new Set([
  "authorization",
  "proxyauthorization",
  "cookie",
  "setcookie",
  "password",
  "passwd",
  "accesstoken",
  "refreshtoken",
  "sessiontoken",
  "token",
  "apikey",
  "clientsecret",
  "privatekey",
  "credential",
  "credentials",
  "databaseurl",
  "smtpurl",
  "redisurl",
  "connectionstring",
  "dsn",
]);

const STRING_PATTERNS = [
  /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi,
  /\b(authorization|cookie|set-cookie)\s*:\s*[^\r\n]+/gi,
  /-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z0-9]+)? PRIVATE KEY-----/gi,
  /\b(access_token|refresh_token|client_secret|api_key|password)\s*[:=]\s*[^\s,;]+/gi,
  /(^|[\s,{;])([A-Z0-9_]*(?:TOKEN|PASSWORD|SECRET|API_KEY|PRIVATE_KEY|COOKIE)[A-Z0-9_]*)\s*[:=]\s*[^\s,;]+/gim,
  /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-(?:proj-)?[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{20,})\b/g,
  /\b[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^@\s/]+@[^\s,;]+/gi,
  /\b(?:DATABASE_URL|SMTP_URL|REDIS_URL|CONNECTION_STRING|DSN)\s*[:=]\s*[^\s,;]+/gi,
];

function normalizedKey(key) {
  return String(key)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function isSensitiveKey(key) {
  const normalized = normalizedKey(key);
  return (
    SECRET_KEYS.has(normalized) ||
    /(secret|token|password|passwd|credential|authorization|cookie|privatekey|apikey|databaseurl|smtpurl|redisurl|connectionstring|dsn)/.test(
      normalized
    )
  );
}

function isSecretReference(value) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    typeof value.secretRef === "string" &&
    /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/.test(value.secretRef)
  );
}

function assertReferencesOnly(
  value,
  path = "$",
  seen = new WeakSet(),
  depth = 0
) {
  if (value === null || value === undefined) return;
  if (typeof value === "string") {
    if (redactString(value) !== value)
      throw new Error(`Raw secret material is forbidden at ${path}.`);
    return;
  }
  if (typeof value !== "object") return;
  if (seen.has(value))
    throw new Error(`Circular input is forbidden at ${path}.`);
  if (depth >= MAX_DEPTH)
    throw new Error(
      `Input exceeds the maximum nesting depth of ${MAX_DEPTH} at ${path}.`
    );
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertReferencesOnly(item, `${path}[${index}]`, seen, depth + 1)
    );
    seen.delete(value);
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (isSensitiveKey(key)) {
      if (!isSecretReference(nested))
        throw new Error(
          `Raw secret material is forbidden at ${path}.${key}; use secretRef.`
        );
      continue;
    }
    assertReferencesOnly(nested, `${path}.${key}`, seen, depth + 1);
  }
  seen.delete(value);
}

function redactString(value) {
  return STRING_PATTERNS.reduce(
    (redacted, pattern) => redacted.replace(pattern, REDACTED),
    value
  );
}

function redactForPersistence(value, seen = new WeakSet(), depth = 0) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value !== "object") return value;
  if (seen.has(value)) return "[CIRCULAR]";
  // This is a best-effort sanitizer used broadly, including from
  // error-handling paths that must not themselves fail — so unlike
  // assertReferencesOnly (a true validator), excess depth degrades to a
  // safe placeholder instead of throwing.
  if (depth >= MAX_DEPTH) return "[MAX_DEPTH_EXCEEDED]";
  seen.add(value);
  if (Array.isArray(value)) {
    const result = value.map((item) =>
      redactForPersistence(item, seen, depth + 1)
    );
    seen.delete(value);
    return result;
  }
  const result = {};
  for (const [key, nested] of Object.entries(value)) {
    result[key] = isSensitiveKey(key)
      ? REDACTED
      : redactForPersistence(nested, seen, depth + 1);
  }
  seen.delete(value);
  return result;
}

module.exports = {
  REDACTED,
  SECRET_KEYS,
  redactString,
  redactForPersistence,
  assertReferencesOnly,
  isSecretReference,
  isSensitiveKey,
};
