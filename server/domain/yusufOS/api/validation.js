const { YusufOSError, ErrorCodes } = require("../errors/YusufOSError");

function validateObject(value, { allowed, required = [] }) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      "Request body must be a JSON object.",
      { status: 422 }
    );
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length)
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      "Request contains unknown fields.",
      { status: 422, details: { unknownFields: unknown } }
    );
  const missing = required.filter(
    (key) =>
      value[key] === undefined || value[key] === null || value[key] === ""
  );
  if (missing.length)
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      "Request is missing required fields.",
      { status: 422, details: { missingFields: missing } }
    );
  return value;
}

function stringValue(value, field, { max = 10000, pattern } = {}) {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `${field} must be a non-empty string no longer than ${max} characters.`,
      { status: 422, details: { field } }
    );
  const normalized = value.trim();
  if (pattern && !pattern.test(normalized))
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `${field} has an invalid format.`,
      { status: 422, details: { field } }
    );
  return normalized;
}

function positiveInt(value, field) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0)
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `${field} must be a positive integer.`,
      { status: 422, details: { field } }
    );
  return parsed;
}

function enumValue(value, field, allowed) {
  if (typeof value !== "string" || !allowed.includes(value))
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `${field} must be one of: ${allowed.join(", ")}.`,
      { status: 422, details: { field, allowed } }
    );
  return value;
}

function pagination(query = {}) {
  const limit =
    query.limit === undefined ? 50 : positiveInt(query.limit, "limit");
  const offset = query.offset === undefined ? 0 : Number(query.offset);
  if (limit > 100 || !Number.isInteger(offset) || offset < 0)
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      "Pagination requires limit 1-100 and a non-negative integer offset.",
      { status: 422 }
    );
  return { take: limit, skip: offset };
}

module.exports = {
  validateObject,
  stringValue,
  positiveInt,
  enumValue,
  pagination,
};
