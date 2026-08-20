const { randomUUID } = require("crypto");
const { YusufOSError, ErrorCodes } = require("../../errors/YusufOSError");
const { KNOWLEDGE_SOURCE_TYPES } = require("../../constants");

const RESOURCE_TYPE = "KNOWLEDGE_ENTRY";
const MAX_TITLE_LENGTH = 300;
const MAX_BODY_BYTES = 8 * 1024;
const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 40;

function assertTags(tags) {
  if (tags === undefined) return [];
  if (!Array.isArray(tags) || tags.length > MAX_TAGS)
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `tags must be an array of at most ${MAX_TAGS} strings.`,
      { status: 422 }
    );
  for (const tag of tags)
    if (
      typeof tag !== "string" ||
      tag.length === 0 ||
      tag.length > MAX_TAG_LENGTH
    )
      throw new YusufOSError(
        ErrorCodes.VALIDATION_ERROR,
        `Each tag must be a non-empty string up to ${MAX_TAG_LENGTH} characters.`,
        { status: 422 }
      );
  return tags;
}

async function buildReadRequest(args = {}) {
  if (typeof args.uuid !== "string" && typeof args.tag !== "string")
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      "Provide either uuid or tag to read Knowledge.",
      { status: 422 }
    );
  return {
    resource: {
      type: RESOURCE_TYPE,
      id: args.uuid || `tag:${args.tag}`,
      version: "N/A",
    },
    target: { uuid: args.uuid || null, tag: args.tag || null },
    payload: {},
    environment: "LOCAL",
  };
}

async function buildWriteRequest(args = {}) {
  if (
    typeof args.title !== "string" ||
    args.title.length === 0 ||
    args.title.length > MAX_TITLE_LENGTH
  )
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `title must be a non-empty string up to ${MAX_TITLE_LENGTH} characters.`,
      { status: 422 }
    );
  if (typeof args.body !== "string" || args.body.length === 0)
    throw new YusufOSError(ErrorCodes.VALIDATION_ERROR, "body is required.", {
      status: 422,
    });
  if (Buffer.byteLength(args.body, "utf8") > MAX_BODY_BYTES)
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      "body exceeds the governed Knowledge entry size limit.",
      { status: 422 }
    );
  if (!Object.values(KNOWLEDGE_SOURCE_TYPES).includes(args.sourceType))
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `Unknown sourceType: ${args.sourceType}`,
      { status: 422 }
    );
  const tags = assertTags(args.tags);
  // A Knowledge entry is a new fact, not a targeted mutation of an existing
  // surface — the server (not the model) mints its identity here, exactly
  // once, so re-executing the same intent is idempotent by that uuid while a
  // genuinely new call correctly produces a new row. See "New adapter class"
  // in docs/yusuf-os/gate-b/knowledge-evidence-memory.md.
  const uuid = randomUUID();
  return {
    resource: { type: RESOURCE_TYPE, id: uuid, version: "ABSENT" },
    target: { uuid },
    payload: {
      title: args.title,
      body: args.body,
      sourceType: args.sourceType,
      sourceRef: typeof args.sourceRef === "string" ? args.sourceRef : null,
      tags,
    },
    environment: "LOCAL",
  };
}

module.exports = { RESOURCE_TYPE, buildReadRequest, buildWriteRequest };
