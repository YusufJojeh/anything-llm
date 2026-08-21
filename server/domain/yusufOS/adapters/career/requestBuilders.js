const { randomUUID } = require("crypto");
const prisma = require("../../../../utils/prisma");
const { YusufOSError, ErrorCodes } = require("../../errors/YusufOSError");
const { CAREER_OPPORTUNITY_STATUSES } = require("../../constants");
const { isValidTransition } = require("../../career/transitions");

const RESOURCE_TYPE = "CAREER_OPPORTUNITY";
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
      {
        status: 422,
      }
    );
  if (Buffer.byteLength(notes, "utf8") > MAX_NOTES_BYTES)
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      "notes exceeds the governed Career entry size limit.",
      { status: 422 }
    );
  return notes;
}

async function buildReadRequest(args = {}) {
  if (typeof args.uuid !== "string" && typeof args.status !== "string")
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      "Provide either uuid or status to read career opportunities.",
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

async function buildRecordOpportunityRequest(args = {}) {
  assertNonEmptyString(args.company, "company");
  assertNonEmptyString(args.role, "role");
  const source =
    typeof args.source === "string" && args.source.length > 0
      ? args.source
      : null;
  const notes = assertNotes(args.notes);
  // Server mints identity; a new opportunity always starts RESEARCHING so
  // every later transition passes through the reviewed transition table
  // rather than an Agent choosing an initial status. See
  // docs/yusuf-os/gate-b/career.md.
  const uuid = randomUUID();
  return {
    resource: { type: RESOURCE_TYPE, id: uuid, version: "ABSENT" },
    target: { uuid },
    payload: {
      company: args.company,
      role: args.role,
      source,
      status: CAREER_OPPORTUNITY_STATUSES.RESEARCHING,
      notes,
    },
    environment: "LOCAL",
  };
}

async function buildUpdateStatusRequest(args = {}, db = prisma) {
  assertNonEmptyString(args.uuid, "uuid");
  if (!Object.values(CAREER_OPPORTUNITY_STATUSES).includes(args.status))
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `Unknown career opportunity status: ${args.status}`,
      { status: 422 }
    );
  if (args.status === CAREER_OPPORTUNITY_STATUSES.APPLIED)
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      "APPLIED requires career.confirm_verified_application with a verified browser submission intent.",
      { status: 422 }
    );
  const notes = assertNotes(args.notes);
  const row = await db.yusuf_career_opportunities.findUnique({
    where: { uuid: args.uuid },
  });
  if (!row)
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `Unknown career opportunity: ${args.uuid}`,
      { status: 422 }
    );
  // Cheap early rejection so an illegal transition never even reaches Policy —
  // the adapter re-checks against a fresh read at execute time (the framework's
  // live-preflight recheck narrows the window; this closes it), same
  // defense-in-depth placement as Memory's scope-ownership check.
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

async function verifiedSubmission(args, db) {
  assertNonEmptyString(args.submissionIntentUuid, "submissionIntentUuid");
  const intent = await db.yusuf_action_intents.findUnique({
    where: { uuid: args.submissionIntentUuid },
    include: { receipt: true, approval: true },
  });
  const opportunityIntent = await db.yusuf_action_intents.findFirst({
    where: {
      capabilityKey: "career.record_opportunity",
      resourceType: RESOURCE_TYPE,
      resourceId: args.uuid,
      status: "VERIFIED",
    },
    orderBy: { createdAt: "asc" },
  });
  let payload = {};
  try {
    payload = JSON.parse(intent?.canonicalPayload || "{}");
  } catch {}
  if (
    !intent ||
    !opportunityIntent ||
    intent.taskId !== opportunityIntent.taskId ||
    intent.capabilityKey !== "browser.submit_form" ||
    intent.status !== "VERIFIED" ||
    intent.receipt?.outcome !== "SUCCEEDED" ||
    intent.receipt?.verificationStatus !== "VERIFIED" ||
    intent.approval?.status !== "CONSUMED" ||
    payload.correlation?.resourceType !== RESOURCE_TYPE ||
    payload.correlation?.resourceId !== args.uuid
  )
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      "The submission intent is not a consumed, verified application for this opportunity.",
      { status: 422 }
    );
  return intent;
}

async function buildConfirmVerifiedApplicationRequest(args = {}, db = prisma) {
  assertNonEmptyString(args.uuid, "uuid");
  const row = await db.yusuf_career_opportunities.findUnique({
    where: { uuid: args.uuid },
  });
  if (!row)
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `Unknown career opportunity: ${args.uuid}`,
      { status: 422 }
    );
  if (!isValidTransition(row.status, CAREER_OPPORTUNITY_STATUSES.APPLIED))
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `Illegal transition: ${row.status} -> APPLIED.`,
      { status: 422 }
    );
  await verifiedSubmission(args, db);
  return {
    resource: { type: RESOURCE_TYPE, id: args.uuid, version: row.digest },
    target: { uuid: args.uuid, status: CAREER_OPPORTUNITY_STATUSES.APPLIED },
    payload: { submissionIntentUuid: args.submissionIntentUuid },
    environment: "LOCAL",
  };
}

const MAX_APPLICATION_NOTES_BYTES = 8 * 1024;

// Phase Q: purely local. Requires the opportunity to still be RESEARCHING —
// once it has moved past that (APPLIED or later), a fresh draft belongs on a
// fresh opportunity, same non-clearable-history reasoning as update_status's
// notes field. Never touches status itself.
async function buildPrepareApplicationRequest(args = {}, db = prisma) {
  assertNonEmptyString(args.uuid, "uuid");
  if (
    typeof args.applicationNotes !== "string" ||
    args.applicationNotes.length === 0
  )
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      "applicationNotes must be a non-empty string.",
      { status: 422 }
    );
  if (
    Buffer.byteLength(args.applicationNotes, "utf8") >
    MAX_APPLICATION_NOTES_BYTES
  )
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      "applicationNotes exceeds the governed Career entry size limit.",
      { status: 422 }
    );
  const row = await db.yusuf_career_opportunities.findUnique({
    where: { uuid: args.uuid },
  });
  if (!row)
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `Unknown career opportunity: ${args.uuid}`,
      { status: 422 }
    );
  if (row.status !== CAREER_OPPORTUNITY_STATUSES.RESEARCHING)
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `An application can only be drafted while an opportunity is still RESEARCHING (current status: ${row.status}).`,
      { status: 422 }
    );
  return {
    resource: { type: RESOURCE_TYPE, id: args.uuid, version: row.digest },
    target: { uuid: args.uuid, status: row.status },
    payload: { applicationNotes: args.applicationNotes },
    environment: "LOCAL",
  };
}

module.exports = {
  RESOURCE_TYPE,
  buildReadRequest,
  buildRecordOpportunityRequest,
  buildUpdateStatusRequest,
  buildPrepareApplicationRequest,
  buildConfirmVerifiedApplicationRequest,
  verifiedSubmission,
};
