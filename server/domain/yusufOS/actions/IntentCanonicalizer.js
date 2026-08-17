const { randomUUID } = require("crypto");
const { normalizePrincipal } = require("../identity/principals");
const { getCapability } = require("../capabilities/registry");
const { canonicalize, canonicalHash } = require("../security/canonicalJson");
const {
  redactForPersistence,
  redactString,
  assertReferencesOnly,
} = require("../security/redaction");
const { YusufOSError, ErrorCodes } = require("../errors/YusufOSError");

const AUTHORITY_FIELDS = Object.freeze([
  "riskLevel",
  "requiresApproval",
  "policyResult",
  "policyDecision",
  "allowed",
  "adapterAuthority",
  "selectedAdapter",
  "idempotencyKey",
  "executionKey",
]);

function assertNoClientAuthority(input) {
  const supplied = AUTHORITY_FIELDS.filter((field) =>
    Object.prototype.hasOwnProperty.call(input || {}, field)
  );
  if (supplied.length)
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      "Action requests cannot supply policy, risk, adapter, or execution authority.",
      { status: 422, details: { forbiddenFields: supplied } }
    );
}

function requiredString(value, field) {
  if (typeof value !== "string" || value.trim().length === 0)
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `${field} is required.`,
      { status: 422, details: { field } }
    );
  return value.trim().normalize("NFC");
}

function canonicalizeActionRequest(input, { requestId } = {}) {
  assertNoClientAuthority(input);
  try {
    assertReferencesOnly(input);
  } catch (error) {
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      "Action requests may contain secret references, never raw secret material.",
      { status: 422, details: { reason: error.message } }
    );
  }
  const principal = normalizePrincipal(input.principal);
  const capabilityKey = requiredString(input.capability, "capability");
  const capability = getCapability(capabilityKey);
  if (!capability)
    throw new YusufOSError(
      ErrorCodes.POLICY_DENIED,
      "The requested capability is not registered.",
      { status: 403, details: { capability: capabilityKey } }
    );
  if (
    !Number.isInteger(Number(input.taskId)) ||
    !Number.isInteger(Number(input.runId))
  )
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      "taskId and runId must be integer identifiers.",
      { status: 422 }
    );
  const semanticResource = {
    type: requiredString(input.resource?.type, "resource.type"),
    id: requiredString(input.resource?.id, "resource.id"),
    version:
      input.resource?.version === null || input.resource?.version === undefined
        ? null
        : requiredString(String(input.resource.version), "resource.version"),
  };
  const target =
    input.target && typeof input.target === "object" ? input.target : {};
  const payload =
    input.payload && typeof input.payload === "object" ? input.payload : {};
  const preconditions =
    input.preconditions && typeof input.preconditions === "object"
      ? input.preconditions
      : {};
  const environment = requiredString(
    input.environment || "LOCAL",
    "environment"
  );
  const semantic = {
    capability: { key: capability.key, version: capability.version },
    resource: semanticResource,
    target,
    environment,
    payload,
    preconditions,
  };
  const payloadHash = canonicalHash(semantic);
  const accountIdentity = target.accountIdentity ?? target.account ?? null;
  const persistedResource = {
    type: redactString(semanticResource.type),
    id: redactString(semanticResource.id),
    version: semanticResource.version
      ? redactString(semanticResource.version)
      : null,
  };
  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime()))
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      "expiresAt must be a valid date-time.",
      { status: 422, details: { field: "expiresAt" } }
    );
  return Object.freeze({
    uuid: randomUUID(),
    taskId: Number(input.taskId),
    runId: Number(input.runId),
    agentId: input.agentId ? Number(input.agentId) : null,
    principal,
    capability,
    resource: persistedResource,
    environment: redactString(environment),
    canonicalTarget: canonicalize(redactForPersistence(target)),
    canonicalPayload: canonicalize(redactForPersistence(payload)),
    canonicalPreconditions: canonicalize(redactForPersistence(preconditions)),
    targetIdentityDigest: canonicalHash({ resource: semanticResource, target }),
    accountIdentityDigest:
      accountIdentity === null ? null : canonicalHash(accountIdentity),
    payloadHash,
    intentFingerprint: canonicalHash({
      runId: Number(input.runId),
      agentId: input.agentId ? Number(input.agentId) : null,
      principal,
      payloadHash,
    }),
    canonicalizationVersion: 1,
    requestId: requiredString(requestId || input.requestId, "requestId"),
    expiresAt,
  });
}

module.exports = {
  AUTHORITY_FIELDS,
  assertNoClientAuthority,
  canonicalizeActionRequest,
};
