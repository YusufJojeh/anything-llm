const prisma = require("../../../utils/prisma");
const { AuditService } = require("../audit/AuditService");
const { PRINCIPAL_TYPES } = require("../constants");

const TOMBSTONE_SUMMARY =
  "[EVIDENCE EXPIRED — content removed per retention policy]";
const TOMBSTONE_PAYLOAD = JSON.stringify({ tombstoned: true });

/**
 * Expires Evidence rows past their class-derived `expiresAt` by truncating
 * `summary`/`payload` to a fixed tombstone, leaving `digest`/`evidenceClass`/
 * `kind`/`runId`/`taskId` untouched — the audit trail keeps knowing *that*
 * something happened and *what class* it was, never *what* it said.
 *
 * Not agent-invokable and not a capability: this is Yusuf OS truncating data
 * it already owns, on a retention schedule it already decided by class — the
 * same tier of operation Gate E already treats as below the Action Boundary
 * (AgentRunCoordinator writes evidence directly, ungoverned). Wiring a
 * scheduled trigger to call this is a separate, later decision — see
 * docs/yusuf-os/gate-b/knowledge-evidence-memory.md.
 */
async function tombstoneExpiredEvidence(
  db = prisma,
  { now = new Date() } = {}
) {
  const audit = new AuditService(db);
  const expired = await db.yusuf_run_evidence.findMany({
    where: { expiresAt: { lte: now }, tombstonedAt: null },
  });
  const tombstoned = [];
  const errors = [];
  for (const row of expired) {
    try {
      // Truncation and its audit event commit together. Two separate calls
      // would let a mid-batch audit failure destroy a row's content with no
      // record it happened — the exact silent-forgetting failure mode
      // ADR-008 exists to prevent.
      const updated = await db.$transaction(async (tx) => {
        const written = await tx.yusuf_run_evidence.update({
          where: { id: row.id },
          data: {
            summary: TOMBSTONE_SUMMARY,
            payload: TOMBSTONE_PAYLOAD,
            tombstonedAt: now,
          },
        });
        await audit.appendInTransaction(tx, {
          eventType: "evidence.tombstoned",
          principal: { type: PRINCIPAL_TYPES.SYSTEM, id: "evidence-retention" },
          taskRef: row.taskId,
          runRef: row.runId,
          resource: { type: "RUN_EVIDENCE", id: row.uuid },
          outcome: "TOMBSTONED",
          metadata: { evidenceClass: row.evidenceClass, digest: row.digest },
          requestId: `evidence-retention:${row.uuid}`,
        });
        return written;
      });
      tombstoned.push(updated);
    } catch (error) {
      // One row's failure must not stop the batch or leave it
      // half-truncated — the transaction above guarantees this row is
      // untouched on error, so it stays eligible for the next run.
      errors.push({ uuid: row.uuid, message: error.message });
    }
  }
  return { tombstonedCount: tombstoned.length, tombstoned, errors };
}

module.exports = {
  tombstoneExpiredEvidence,
  TOMBSTONE_SUMMARY,
  TOMBSTONE_PAYLOAD,
};
