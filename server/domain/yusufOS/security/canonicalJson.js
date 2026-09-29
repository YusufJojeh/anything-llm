const { createHash } = require("crypto");
const { YusufOSError, ErrorCodes } = require("../errors/YusufOSError");

// Bounds recursion depth so a maliciously or accidentally deeply-nested
// payload fails closed with a clean, typed error instead of a raw
// RangeError from stack exhaustion. No legitimate governed payload in this
// system (ActionIntent payloads, evidence, policy metadata) nests anywhere
// near this deep.
const MAX_DEPTH = 64;

function normalize(value, seen = new WeakSet(), depth = 0) {
  if (value === null) return null;
  if (typeof value === "string") return value.normalize("NFC");
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new YusufOSError(
        ErrorCodes.VALIDATION_ERROR,
        "Canonical JSON cannot contain non-finite numbers.",
        { status: 422 }
      );
    return Object.is(value, -0) ? 0 : value;
  }
  if (value instanceof Date) return value.toISOString();
  if (["undefined", "function", "symbol", "bigint"].includes(typeof value))
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `Canonical JSON cannot contain ${typeof value}.`,
      { status: 422 }
    );
  if (typeof value !== "object") return value;
  if (seen.has(value))
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      "Canonical JSON cannot contain cyclic values.",
      { status: 422 }
    );
  if (depth >= MAX_DEPTH)
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `Canonical JSON exceeds the maximum nesting depth of ${MAX_DEPTH}.`,
      { status: 422 }
    );
  seen.add(value);
  let result;
  if (Array.isArray(value))
    result = value.map((item) => normalize(item, seen, depth + 1));
  else {
    result = {};
    for (const key of Object.keys(value).sort())
      result[key.normalize("NFC")] = normalize(value[key], seen, depth + 1);
  }
  seen.delete(value);
  return result;
}

function canonicalize(value) {
  return JSON.stringify(normalize(value));
}

function sha256(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

function canonicalHash(value) {
  return sha256(canonicalize(value));
}

module.exports = { normalize, canonicalize, sha256, canonicalHash };
