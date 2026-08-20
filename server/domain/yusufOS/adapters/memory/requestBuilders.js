const prisma = require("../../../../utils/prisma");
const { YusufOSError, ErrorCodes } = require("../../errors/YusufOSError");
const { MEMORY_SCOPES } = require("../../constants");

const RESOURCE_TYPE = "MEMORY_ENTRY";
const MAX_KEY_LENGTH = 200;
const MAX_VALUE_BYTES = 16 * 1024;

function assertShape(args) {
  if (!Object.values(MEMORY_SCOPES).includes(args.scope))
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `Unknown memory scope: ${args.scope}`,
      { status: 422 }
    );
  if (typeof args.scopeRef !== "string" || args.scopeRef.length === 0)
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      "scopeRef is required.",
      { status: 422 }
    );
  if (
    typeof args.key !== "string" ||
    args.key.length === 0 ||
    args.key.length > MAX_KEY_LENGTH
  )
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `key must be a non-empty string up to ${MAX_KEY_LENGTH} characters.`,
      { status: 422 }
    );
}

function resourceId(args) {
  return `${args.scope}:${args.scopeRef}:${args.key}`;
}

// Mirrors ProjectAdapter's `currentDigest`/`fileDigest("ABSENT")` convention:
// the resource version recorded at intent-creation time is the pre-write
// state, so a concurrent conflicting write is caught as resource drift by the
// framework's generic live-preflight recheck, exactly like a file write.
async function currentDigest(args, db) {
  const row = await db.yusuf_memory_entries.findUnique({
    where: {
      scope_scopeRef_key: {
        scope: args.scope,
        scopeRef: args.scopeRef,
        key: args.key,
      },
    },
  });
  return row ? row.digest : "ABSENT";
}

async function buildReadRequest(args = {}, db = prisma) {
  assertShape(args);
  return {
    resource: {
      type: RESOURCE_TYPE,
      id: resourceId(args),
      version: await currentDigest(args, db),
    },
    target: { scope: args.scope, scopeRef: args.scopeRef, key: args.key },
    payload: {},
    environment: "LOCAL",
  };
}

async function buildWriteRequest(args = {}, db = prisma) {
  assertShape(args);
  if (typeof args.value === "undefined")
    throw new YusufOSError(ErrorCodes.VALIDATION_ERROR, "value is required.", {
      status: 422,
    });
  const serialized = JSON.stringify(args.value);
  if (Buffer.byteLength(serialized, "utf8") > MAX_VALUE_BYTES)
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      "value exceeds the governed Memory entry size limit.",
      { status: 422 }
    );
  return {
    resource: {
      type: RESOURCE_TYPE,
      id: resourceId(args),
      version: await currentDigest(args, db),
    },
    target: { scope: args.scope, scopeRef: args.scopeRef, key: args.key },
    payload: { value: args.value },
    environment: "LOCAL",
  };
}

module.exports = { RESOURCE_TYPE, buildReadRequest, buildWriteRequest };
