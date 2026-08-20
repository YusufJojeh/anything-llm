const { randomUUID } = require("crypto");
const prisma = require("../../../../utils/prisma");
const { YusufOSError, ErrorCodes } = require("../../errors/YusufOSError");
const { FOUNDER_VENTURE_STATUSES } = require("../../constants");
const { isValidTransition } = require("../../founder/transitions");

const RESOURCE_TYPE = "FOUNDER_VENTURE";
const MAX_FIELD_LENGTH = 300;
const MAX_NOTES_BYTES = 8 * 1024;

function assertNonEmptyString(value, label, maxLength = MAX_FIELD_LENGTH) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maxLength
  )
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `${label} must be a non-empty string up to ${maxLength} characters.`,
      { status: 422 }
    );
}

function assertNotes(notes) {
  if (notes === undefined || notes === null) return null;
  if (typeof notes !== "string")
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      "notes must be a string.",
      { status: 422 }
    );
  if (Buffer.byteLength(notes, "utf8") > MAX_NOTES_BYTES)
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      "notes exceeds the governed Founder entry size limit.",
      { status: 422 }
    );
  return notes;
}

async function buildReadRequest(args = {}) {
  if (typeof args.uuid !== "string" && typeof args.status !== "string")
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      "Provide either uuid or status to read founder ventures.",
      { status: 422 }
    );
  return {
    resource: {
      type: RESOURCE_TYPE,
      id: args.uuid || `status:${args.status}`,
      version: "N/A",
    },
    target: { uuid: args.uuid || null, status: args.status || null },
    payload: {},
    environment: "LOCAL",
  };
}

async function buildRecordVentureRequest(args = {}) {
  assertNonEmptyString(args.name, "name");
  assertNonEmptyString(args.category, "category");
  const notes = assertNotes(args.notes);
  // Server mints identity; a new venture always starts IDEA so every later
  // transition passes through the reviewed transition table rather than an
  // Agent choosing an initial status. See docs/yusuf-os/gate-b/founder.md.
  const uuid = randomUUID();
  return {
    resource: { type: RESOURCE_TYPE, id: uuid, version: "ABSENT" },
    target: { uuid },
    payload: {
      name: args.name,
      category: args.category,
      status: FOUNDER_VENTURE_STATUSES.IDEA,
      notes,
    },
    environment: "LOCAL",
  };
}

async function buildUpdateStatusRequest(args = {}, db = prisma) {
  assertNonEmptyString(args.uuid, "uuid");
  if (!Object.values(FOUNDER_VENTURE_STATUSES).includes(args.status))
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `Unknown founder venture status: ${args.status}`,
      { status: 422 }
    );
  const notes = assertNotes(args.notes);
  const row = await db.yusuf_founder_ventures.findUnique({
    where: { uuid: args.uuid },
  });
  if (!row)
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `Unknown founder venture: ${args.uuid}`,
      { status: 422 }
    );
  // Cheap early rejection so an illegal transition never even reaches Policy —
  // the adapter re-checks against a fresh read at execute time (same
  // defense-in-depth placement as Career/Marketing's transition rechecks).
  if (!isValidTransition(row.status, args.status))
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `Illegal transition: ${row.status} -> ${args.status}.`,
      { status: 422 }
    );
  return {
    resource: { type: RESOURCE_TYPE, id: args.uuid, version: row.digest },
    target: { uuid: args.uuid, status: args.status },
    payload: { notes },
    environment: "LOCAL",
  };
}

module.exports = {
  RESOURCE_TYPE,
  buildReadRequest,
  buildRecordVentureRequest,
  buildUpdateStatusRequest,
};
