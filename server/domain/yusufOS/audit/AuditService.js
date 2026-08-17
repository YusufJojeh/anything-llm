const { randomUUID, createHmac, timingSafeEqual } = require("crypto");
const { canonicalize, sha256 } = require("../security/canonicalJson");
const { redactForPersistence } = require("../security/redaction");
const { normalizePrincipal } = require("../identity/principals");
const { YusufOSError, ErrorCodes } = require("../errors/YusufOSError");

const GENESIS_HASH = "0".repeat(64);
const CANONICALIZATION_VERSION = 1;
const appendQueues = new WeakMap();

function auditKey() {
  const key = process.env.YUSUF_OS_AUDIT_HMAC_KEY;
  if (typeof key !== "string" || key.length < 32)
    throw new YusufOSError(
      ErrorCodes.UNAUTHORIZED,
      "Yusuf OS audit authentication is not securely configured.",
      { status: 503 }
    );
  return key;
}

/**
 * Whether the audit subsystem is actually usable. Callers that need to report
 * health must use this rather than a bare `typeof` check on the env var — a
 * short or empty key passes a type check but makes every append and every
 * verification fail closed.
 */
function auditKeyConfigured() {
  try {
    auditKey();
    return true;
  } catch {
    return false;
  }
}

function checkpointSignature(sequence, hash) {
  return createHmac("sha256", auditKey())
    .update(`${sequence}:${hash}`, "utf8")
    .digest("hex");
}

function signatureMatches(checkpoint) {
  const expected = Buffer.from(
    checkpointSignature(checkpoint.lastSequence, checkpoint.lastHash),
    "hex"
  );
  const actual = Buffer.from(String(checkpoint.signature || ""), "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function hashableEvent(event) {
  return {
    uuid: event.uuid,
    sequence: event.sequence,
    occurredAt:
      event.occurredAt instanceof Date
        ? event.occurredAt.toISOString()
        : new Date(event.occurredAt).toISOString(),
    eventType: event.eventType,
    principalType: event.principalType,
    principalId: event.principalId,
    taskRef: event.taskRef || null,
    runRef: event.runRef || null,
    intentRef: event.intentRef || null,
    approvalRef: event.approvalRef || null,
    resourceType: event.resourceType || null,
    resourceId: event.resourceId || null,
    outcome: event.outcome || null,
    metadata: event.metadata,
    requestId: event.requestId,
    canonicalizationVersion: event.canonicalizationVersion,
    previousHash: event.previousHash,
  };
}

function computeEventHash(event) {
  return sha256(canonicalize(hashableEvent(event)));
}

class AuditService {
  constructor(db) {
    this.db = db;
  }

  async appendInTransaction(tx, input) {
    const principal = normalizePrincipal(input.principal);
    const previous = await tx.yusuf_audit_events.findFirst({
      orderBy: { sequence: "desc" },
      select: { sequence: true, eventHash: true },
    });
    const occurredAt = input.occurredAt || new Date();
    const metadata = canonicalize(redactForPersistence(input.metadata || {}));
    const event = {
      uuid: randomUUID(),
      sequence: (previous?.sequence || 0) + 1,
      occurredAt,
      eventType: input.eventType,
      principalType: principal.type,
      principalId: principal.id,
      taskRef: input.taskRef ? String(input.taskRef) : null,
      runRef: input.runRef ? String(input.runRef) : null,
      intentRef: input.intentRef ? String(input.intentRef) : null,
      approvalRef: input.approvalRef ? String(input.approvalRef) : null,
      resourceType: input.resource?.type || null,
      resourceId: input.resource?.id ? String(input.resource.id) : null,
      outcome: input.outcome || null,
      metadata,
      requestId: input.requestId,
      canonicalizationVersion: CANONICALIZATION_VERSION,
      previousHash: previous?.eventHash || GENESIS_HASH,
    };
    const created = await tx.yusuf_audit_events.create({
      data: { ...event, eventHash: computeEventHash(event) },
    });
    if (!previous) {
      await tx.yusuf_audit_checkpoints.create({
        data: {
          key: "PRIMARY",
          lastSequence: created.sequence,
          lastHash: created.eventHash,
          signature: checkpointSignature(created.sequence, created.eventHash),
        },
      });
    } else {
      const checkpoint = await tx.yusuf_audit_checkpoints.updateMany({
        where: {
          key: "PRIMARY",
          lastSequence: previous.sequence,
          lastHash: previous.eventHash,
        },
        data: {
          lastSequence: created.sequence,
          lastHash: created.eventHash,
          signature: checkpointSignature(created.sequence, created.eventHash),
        },
      });
      if (checkpoint.count !== 1)
        throw new YusufOSError(
          ErrorCodes.CONFLICT,
          "Audit checkpoint changed or is missing; append failed closed.",
          { status: 409 }
        );
    }
    return created;
  }

  async append(input) {
    const previous = appendQueues.get(this.db) || Promise.resolve();
    const current = previous
      .catch(() => undefined)
      .then(() =>
        this.db.$transaction((tx) => this.appendInTransaction(tx, input))
      );
    appendQueues.set(this.db, current);
    try {
      return await current;
    } finally {
      if (appendQueues.get(this.db) === current) appendQueues.delete(this.db);
    }
  }

  async verify() {
    try {
      auditKey();
    } catch {
      return { valid: false, reason: "AUDIT_KEY_MISSING" };
    }
    const [events, checkpoint] = await Promise.all([
      this.db.yusuf_audit_events.findMany({ orderBy: { sequence: "asc" } }),
      this.db.yusuf_audit_checkpoints.findUnique({ where: { key: "PRIMARY" } }),
    ]);
    if (!events.length)
      return checkpoint
        ? { valid: false, reason: "CHECKPOINT_WITHOUT_EVENTS" }
        : { valid: false, reason: "AUDIT_CHAIN_UNINITIALIZED" };
    if (!checkpoint) return { valid: false, reason: "CHECKPOINT_MISSING" };
    if (!signatureMatches(checkpoint))
      return { valid: false, reason: "CHECKPOINT_SIGNATURE_MISMATCH" };
    let previousHash = GENESIS_HASH;
    let expectedSequence = 1;
    for (const event of events) {
      if (event.sequence !== expectedSequence)
        return {
          valid: false,
          reason: "SEQUENCE_GAP",
          expectedSequence,
          actualSequence: event.sequence,
        };
      if (event.previousHash !== previousHash)
        return {
          valid: false,
          reason: "PREVIOUS_HASH_MISMATCH",
          sequence: event.sequence,
        };
      if (event.eventHash !== computeEventHash(event))
        return {
          valid: false,
          reason: "EVENT_HASH_MISMATCH",
          sequence: event.sequence,
        };
      previousHash = event.eventHash;
      expectedSequence += 1;
    }
    const last = events.at(-1);
    if (
      checkpoint.lastSequence !== last.sequence ||
      checkpoint.lastHash !== last.eventHash
    )
      return {
        valid: false,
        reason: "CHECKPOINT_MISMATCH",
        expectedSequence: checkpoint.lastSequence,
        actualSequence: last.sequence,
      };
    return { valid: true, count: events.length, lastHash: previousHash };
  }
}

module.exports = {
  AuditService,
  auditKeyConfigured,
  GENESIS_HASH,
  CANONICALIZATION_VERSION,
  hashableEvent,
  computeEventHash,
  checkpointSignature,
};
