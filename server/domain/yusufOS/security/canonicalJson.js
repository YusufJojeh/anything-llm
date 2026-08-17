const { createHash } = require("crypto");
const { YusufOSError, ErrorCodes } = require("../errors/YusufOSError");

function normalize(value, seen = new WeakSet()) {
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
  seen.add(value);
  let result;
  if (Array.isArray(value)) result = value.map((item) => normalize(item, seen));
  else {
    result = {};
    for (const key of Object.keys(value).sort())
      result[key.normalize("NFC")] = normalize(value[key], seen);
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
