const prisma = require("../../../utils/prisma");
const { YusufOSError, ErrorCodes } = require("../errors/YusufOSError");

const SCHEMA_VERSION = 1;
const MAX_EVENT_BATCH = 200;

/**
 * Maps an audit event type to the aggregate a Command Center would update.
 * Anything unmapped is deliberately dropped rather than passed through with a
 * guessed aggregate — an unknown event should trigger a snapshot refresh, not
 * a silently mis-attributed UI mutation.
 */
const EVENT_AGGREGATES = Object.freeze({
  "task.delegated": "task",
  "task.completed": "task",
  "task.blocked": "task",
  "agent.run.created": "run",
  "agent.run.started": "run",
  "agent.run.completed": "run",
  "agent.run.blocked": "run",
  "agent.run.waiting_approval": "run",
  "agent.run.waiting_handoff": "run",
  "agent.run.failed": "run",
  "agent.run.failed_unknown": "run",
  "agent.run.cancelled": "run",
  "agent.run.verifying": "run",
  "agent.run.waiting_tool": "run",
  "agent.run.waiting_dependency": "run",
  "handoff.created": "handoff",
  "handoff.accepted": "handoff",
  "handoff.completed": "handoff",
  "review.passed": "review",
  "review.blocked": "review",
  "intent.created": "intent",
  "policy.decision": "intent",
  "approval.decided": "approval",
  "approval.expired": "approval",
  "approval.invalidated": "approval",
  "execution.claimed": "intent",
  "execution.verified": "intent",
  "execution.failed": "intent",
  "execution.blocked": "intent",
  "execution.recovery_required": "intent",
  "security.external_mutations_changed": "system",
});

// Only these metadata keys are ever forwarded to a client. The audit metadata
// is already redacted at write time, but a projection stream should carry the
// minimum a UI needs to update state — not whatever a future audit event
// happens to include. Deny-by-default: a new metadata key is invisible to the
// stream until someone deliberately adds it here.
const FORWARDABLE_METADATA_KEYS = Object.freeze([
  "riskLevel",
  "reasonCode",
  "runKind",
  "verdict",
  "edge",
  "reason",
  "approvalCreated",
  "verificationStatus",
  "unknown",
  "blockers",
  "disabled",
  "findingCount",
  "reviewVerdict",
  "warningCount",
  "attempt",
]);

function safeMetadata(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw || "{}");
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const out = {};
  for (const key of FORWARDABLE_METADATA_KEYS) {
    if (parsed[key] !== undefined) out[key] = parsed[key];
  }
  return out;
}

// Aggregate types whose audit refs are internal numeric ids needing
// translation to the public uuid. Intents and approvals are already recorded
// by uuid, so they pass through untouched.
const NUMERIC_REF_AGGREGATES = Object.freeze({
  task: "tasks",
  run: "runs",
  handoff: "tasks",
  review: "tasks",
});

function resolveIdentity(aggregateType, rawId, identityMap) {
  const bucket = NUMERIC_REF_AGGREGATES[aggregateType];
  if (!bucket) return String(rawId);
  const numeric = Number(rawId);
  // Already a uuid (or otherwise non-numeric) — leave it alone.
  if (!Number.isInteger(numeric)) return String(rawId);
  const resolved = identityMap?.[bucket]?.get(numeric);
  // Fail closed: emitting the raw internal id would give a client an
  // identifier it cannot join against any other projection.
  return resolved || null;
}

function aggregateIdFor(aggregateType, event) {
  switch (aggregateType) {
    case "task":
      return event.taskRef || null;
    case "run":
      return event.runRef || null;
    case "intent":
      return event.intentRef || null;
    case "approval":
      return event.approvalRef || null;
    case "handoff":
    case "review":
      return event.taskRef || null;
    case "system":
      return "system";
    default:
      return null;
  }
}

/**
 * Projects the tamper-evident audit chain into the client event envelope
 * defined in `docs/yusuf-os/gate-b/api-realtime-frontend.md` §5.
 *
 * The audit chain is reused deliberately rather than adding a second event
 * store: it already provides a single global monotonic `sequence`, durable
 * retention, and write-time redaction, which is exactly what the realtime
 * contract requires. This is a read-only projection — nothing here can write,
 * reorder, or delete an audit row, so the stream cannot become a way to
 * influence the security record.
 */
class EventProjection {
  constructor(db = prisma) {
    this.db = db;
  }

  /**
   * Resolves every internal task/run id referenced by this batch to its public
   * uuid in two queries, rather than one lookup per event.
   */
  async #identityMap(rows) {
    const taskIds = new Set();
    const runIds = new Set();
    for (const row of rows) {
      const task = Number(row.taskRef);
      if (Number.isInteger(task)) taskIds.add(task);
      const run = Number(row.runRef);
      if (Number.isInteger(run)) runIds.add(run);
    }
    const [tasks, runs] = await Promise.all([
      taskIds.size
        ? this.db.yusuf_tasks.findMany({
            where: { id: { in: [...taskIds] } },
            select: { id: true, uuid: true },
          })
        : [],
      runIds.size
        ? this.db.yusuf_agent_runs.findMany({
            where: { id: { in: [...runIds] } },
            select: { id: true, uuid: true },
          })
        : [],
    ]);
    return {
      tasks: new Map(tasks.map((t) => [t.id, t.uuid])),
      runs: new Map(runs.map((r) => [r.id, r.uuid])),
    };
  }

  toEnvelope(event, identityMap = null) {
    const aggregateType = EVENT_AGGREGATES[event.eventType];
    if (!aggregateType) return null;
    const rawId = aggregateIdFor(aggregateType, event);
    if (!rawId) return null;
    // Audit rows reference tasks and runs by internal numeric id, but every
    // other projection (and therefore any client) identifies them by uuid.
    // Translate here so a stream event can actually be correlated with the
    // dashboard entity it updates; without this the two surfaces are unjoinable.
    const aggregateId = resolveIdentity(aggregateType, rawId, identityMap);
    if (!aggregateId) return null;
    return {
      id: event.uuid,
      sequence: event.sequence,
      schemaVersion: SCHEMA_VERSION,
      type: event.eventType,
      occurredAt: event.occurredAt.toISOString(),
      aggregateType,
      aggregateId: String(aggregateId),
      data: {
        outcome: event.outcome || null,
        ...safeMetadata(event.metadata),
      },
    };
  }

  /**
   * Returns events strictly after `afterSequence`.
   *
   * `reset` tells the client its cursor is unusable and it must reload the
   * snapshot: either the cursor is ahead of the chain (a restored/rebuilt
   * database), or the requested position is no longer retained.
   */
  async since(afterSequence = 0, limit = 100) {
    const after = Number(afterSequence);
    if (!Number.isInteger(after) || after < 0)
      throw new YusufOSError(
        ErrorCodes.VALIDATION_ERROR,
        "after must be a non-negative integer event sequence.",
        { status: 422 }
      );
    const take = Math.min(Math.max(Number(limit) || 100, 1), MAX_EVENT_BATCH);

    const [tip, earliest] = await Promise.all([
      this.db.yusuf_audit_events.findFirst({
        orderBy: { sequence: "desc" },
        select: { sequence: true },
      }),
      this.db.yusuf_audit_events.findFirst({
        orderBy: { sequence: "asc" },
        select: { sequence: true },
      }),
    ]);
    const tipSequence = tip?.sequence || 0;

    if (after > tipSequence)
      return {
        reset: true,
        reason: "CURSOR_AHEAD_OF_CHAIN",
        cursor: String(tipSequence),
        events: [],
      };
    if (earliest && after > 0 && after < earliest.sequence - 1)
      return {
        reset: true,
        reason: "RETENTION_GAP",
        cursor: String(tipSequence),
        events: [],
      };

    const rows = await this.db.yusuf_audit_events.findMany({
      where: { sequence: { gt: after } },
      orderBy: { sequence: "asc" },
      take,
    });
    const identityMap = await this.#identityMap(rows);
    const events = rows
      .map((row) => this.toEnvelope(row, identityMap))
      .filter(Boolean);
    // The cursor advances past every row examined, including ones with no
    // client-visible projection. Otherwise an unmapped event would be
    // re-fetched forever.
    const cursor = rows.length
      ? String(rows[rows.length - 1].sequence)
      : String(after);
    return {
      reset: false,
      cursor,
      events,
      hasMore: rows.length === take && Number(cursor) < tipSequence,
    };
  }
}

module.exports = {
  EventProjection,
  EVENT_AGGREGATES,
  FORWARDABLE_METADATA_KEYS,
  SCHEMA_VERSION,
  safeMetadata,
};
