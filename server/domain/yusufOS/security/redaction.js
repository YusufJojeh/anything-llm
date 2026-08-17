const REDACTED = "[REDACTED]";

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
]);

const STRING_PATTERNS = [
  /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi,
  /\b(authorization|cookie|set-cookie)\s*:\s*[^\r\n]+/gi,
  /-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z0-9]+)? PRIVATE KEY-----/gi,
  /\b(access_token|refresh_token|client_secret|api_key|password)\s*[:=]\s*[^\s,;]+/gi,
  /(^|[\s,{;])([A-Z0-9_]*(?:TOKEN|PASSWORD|SECRET|API_KEY|PRIVATE_KEY|COOKIE)[A-Z0-9_]*)\s*[:=]\s*[^\s,;]+/gim,
  /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-(?:proj-)?[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{20,})\b/g,
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
    /(secret|token|password|passwd|credential|authorization|cookie|privatekey|apikey)/.test(
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

function assertReferencesOnly(value, path = "$", seen = new WeakSet()) {
  if (value === null || value === undefined) return;
  if (typeof value === "string") {
    if (redactString(value) !== value)
      throw new Error(`Raw secret material is forbidden at ${path}.`);
    return;
  }
  if (typeof value !== "object") return;
  if (seen.has(value))
    throw new Error(`Circular input is forbidden at ${path}.`);
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertReferencesOnly(item, `${path}[${index}]`, seen)
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
    assertReferencesOnly(nested, `${path}.${key}`, seen);
  }
  seen.delete(value);
}

function redactString(value) {
  return STRING_PATTERNS.reduce(
    (redacted, pattern) => redacted.replace(pattern, REDACTED),
    value
  );
}

function redactForPersistence(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value !== "object") return value;
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);
  if (Array.isArray(value)) {
    const result = value.map((item) => redactForPersistence(item, seen));
    seen.delete(value);
    return result;
  }
  const result = {};
  for (const [key, nested] of Object.entries(value)) {
    result[key] = isSensitiveKey(key)
      ? REDACTED
      : redactForPersistence(nested, seen);
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
