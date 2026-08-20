const { randomUUID } = require("crypto");
const prisma = require("../../../../utils/prisma");
const { YusufOSError, ErrorCodes } = require("../../errors/YusufOSError");
const {
  INBOX_MESSAGE_STATUSES,
  INBOX_CLASSIFICATIONS,
  CAREER_OPPORTUNITY_STATUSES,
} = require("../../constants");
const { isValidTransition } = require("../../inbox/transitions");
const {
  isValidTransition: isValidCareerTransition,
} = require("../../career/transitions");

const RESOURCE_TYPE = "INBOX_MESSAGE";
const MAX_FIELD_LENGTH = 300;
const MAX_SNIPPET_BYTES = 8 * 1024;
const MAX_DRAFT_BYTES = 8 * 1024;

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

function assertOptionalBoundedString(value, label, maxBytes) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string")
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `${label} must be a string.`,
      { status: 422 }
    );
  if (Buffer.byteLength(value, "utf8") > maxBytes)
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `${label} exceeds the governed Inbox entry size limit.`,
      { status: 422 }
    );
  return value;
}

async function buildReadRequest(args = {}) {
  if (typeof args.uuid !== "string" && typeof args.status !== "string")
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      "Provide either uuid or status to read inbox messages.",
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

async function buildRecordMessageRequest(args = {}) {
  assertNonEmptyString(args.sender, "sender");
  assertNonEmptyString(args.subject, "subject");
  const snippet = assertOptionalBoundedString(
    args.snippet,
    "snippet",
    MAX_SNIPPET_BYTES
  );
  // Server mints identity; a new message always starts NEW so every later
  // transition passes through the reviewed transition table rather than an
  // Agent choosing an initial status. See docs/yusuf-os/gate-b/sales-inbox.md.
  const uuid = randomUUID();
  return {
    resource: { type: RESOURCE_TYPE, id: uuid, version: "ABSENT" },
    target: { uuid },
    payload: {
      sender: args.sender,
      subject: args.subject,
      snippet,
      classification: null,
      status: INBOX_MESSAGE_STATUSES.NEW,
      draftReplyBody: null,
      linkedCareerOpportunityUuid: null,
    },
    environment: "LOCAL",
  };
}

async function buildClassifyMessageRequest(args = {}, db = prisma) {
  assertNonEmptyString(args.uuid, "uuid");
  if (!Object.values(INBOX_CLASSIFICATIONS).includes(args.classification))
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `Unknown inbox classification: ${args.classification}`,
      { status: 422 }
    );
  const row = await db.yusuf_inbox_messages.findUnique({
    where: { uuid: args.uuid },
  });
  if (!row)
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `Unknown inbox message: ${args.uuid}`,
      { status: 422 }
    );
  // Classifying always lands the message at TRIAGED (from NEW or TRIAGED —
  // reclassification is a self-loop, not a backward edge). Cheap early
  // rejection so an illegal call (e.g. a DRAFTED or ARCHIVED_LOCAL message)
  // never even reaches Policy — the adapter re-checks against a fresh read
  // at execute time.
  if (!isValidTransition(row.status, "TRIAGED"))
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `Illegal transition: ${row.status} -> TRIAGED.`,
      { status: 422 }
    );
  let linkedCareerOpportunityUuid = null;
  if (
    args.linkedCareerOpportunityUuid !== undefined &&
    args.linkedCareerOpportunityUuid !== null
  ) {
    assertNonEmptyString(
      args.linkedCareerOpportunityUuid,
      "linkedCareerOpportunityUuid"
    );
    const opportunity = await db.yusuf_career_opportunities.findUnique({
      where: { uuid: args.linkedCareerOpportunityUuid },
    });
    if (!opportunity)
      throw new YusufOSError(
        ErrorCodes.VALIDATION_ERROR,
        `Unknown career opportunity: ${args.linkedCareerOpportunityUuid}`,
        { status: 422 }
      );
    linkedCareerOpportunityUuid = args.linkedCareerOpportunityUuid;
  }
  return {
    resource: { type: RESOURCE_TYPE, id: args.uuid, version: row.digest },
    target: { uuid: args.uuid, status: "TRIAGED" },
    payload: {
      classification: args.classification,
      linkedCareerOpportunityUuid,
    },
    environment: "LOCAL",
  };
}

async function buildPrepareReplyRequest(args = {}, db = prisma) {
  assertNonEmptyString(args.uuid, "uuid");
  const draftReplyBody = assertOptionalBoundedString(
    args.draftReplyBody,
    "draftReplyBody",
    MAX_DRAFT_BYTES
  );
  if (!draftReplyBody)
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      "draftReplyBody is required to prepare a reply.",
      { status: 422 }
    );
  const row = await db.yusuf_inbox_messages.findUnique({
    where: { uuid: args.uuid },
  });
  if (!row)
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `Unknown inbox message: ${args.uuid}`,
      { status: 422 }
    );
  if (!row.classification)
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      "A message must be classified before a reply can be prepared.",
      { status: 422 }
    );
  if (!isValidTransition(row.status, "DRAFTED"))
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `Illegal transition: ${row.status} -> DRAFTED.`,
      { status: 422 }
    );
  return {
    resource: { type: RESOURCE_TYPE, id: args.uuid, version: row.digest },
    target: { uuid: args.uuid, status: "DRAFTED" },
    payload: { draftReplyBody },
    environment: "LOCAL",
  };
}

async function buildArchiveLocalRequest(args = {}, db = prisma) {
  assertNonEmptyString(args.uuid, "uuid");
  const row = await db.yusuf_inbox_messages.findUnique({
    where: { uuid: args.uuid },
  });
  if (!row)
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `Unknown inbox message: ${args.uuid}`,
      { status: 422 }
    );
  if (!isValidTransition(row.status, "ARCHIVED_LOCAL"))
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `Illegal transition: ${row.status} -> ARCHIVED_LOCAL.`,
      { status: 422 }
    );
  return {
    resource: { type: RESOURCE_TYPE, id: args.uuid, version: row.digest },
    target: { uuid: args.uuid, status: "ARCHIVED_LOCAL" },
    payload: {},
    environment: "LOCAL",
  };
}

const CAREER_RESOURCE_TYPE = "CAREER_OPPORTUNITY";
// Classifications that make an inbox message an acceptable trigger for
// advancing a linked Career opportunity. Anything else (OPPORTUNITY/BOUNCE/
// OTHER) never authorizes a career state change from Inbox.
const CAREER_ADVANCING_CLASSIFICATIONS = Object.freeze([
  INBOX_CLASSIFICATIONS.INTERVIEW,
  INBOX_CLASSIFICATIONS.REJECTION,
]);

// The Career integration seam (docs/yusuf-os/gate-b/sales-inbox.md): Inbox
// may never call the raw career.update_status capability directly, because
// that builder accepts any opportunity uuid with no awareness of whether it
// was ever linked from an inbox message. This builder is the only path
// Inbox has into Career's state machine, and it enforces the linkage and
// classification precondition server-side rather than relying on the
// Agent's own instructions to behave — the earlier design left this as
// advisory prose only, which independent review flagged as a real gap.
async function buildAdvanceLinkedCareerStatusRequest(args = {}, db = prisma) {
  assertNonEmptyString(args.inboxMessageUuid, "inboxMessageUuid");
  if (!Object.values(CAREER_OPPORTUNITY_STATUSES).includes(args.status))
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `Unknown career opportunity status: ${args.status}`,
      { status: 422 }
    );
  const message = await db.yusuf_inbox_messages.findUnique({
    where: { uuid: args.inboxMessageUuid },
  });
  if (!message)
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `Unknown inbox message: ${args.inboxMessageUuid}`,
      { status: 422 }
    );
  if (!message.linkedCareerOpportunityUuid)
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      "This inbox message is not linked to a career opportunity.",
      { status: 422 }
    );
  if (!CAREER_ADVANCING_CLASSIFICATIONS.includes(message.classification))
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `Inbox message classification ${message.classification} does not authorize a career status change.`,
      { status: 422 }
    );
  const opportunity = await db.yusuf_career_opportunities.findUnique({
    where: { uuid: message.linkedCareerOpportunityUuid },
  });
  if (!opportunity)
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `Unknown career opportunity: ${message.linkedCareerOpportunityUuid}`,
      { status: 422 }
    );
  if (!isValidCareerTransition(opportunity.status, args.status))
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `Illegal transition: ${opportunity.status} -> ${args.status}.`,
      { status: 422 }
    );
  return {
    resource: {
      type: CAREER_RESOURCE_TYPE,
      id: opportunity.uuid,
      version: opportunity.digest,
    },
    target: {
      uuid: opportunity.uuid,
      status: args.status,
      sourceInboxMessageUuid: message.uuid,
    },
    payload: {},
    environment: "LOCAL",
  };
}

module.exports = {
  RESOURCE_TYPE,
  buildReadRequest,
  buildRecordMessageRequest,
  buildClassifyMessageRequest,
  buildPrepareReplyRequest,
  buildArchiveLocalRequest,
  buildAdvanceLinkedCareerStatusRequest,
};
