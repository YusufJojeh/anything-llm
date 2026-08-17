const { randomUUID } = require("crypto");
const prisma = require("../../../utils/prisma");
const {
  REVIEW_VERDICTS,
  RUN_KINDS,
  PRINCIPAL_TYPES,
  AGENT_KEYS,
} = require("../constants");
const { AuditService } = require("../audit/AuditService");
const { canonicalHash } = require("../security/canonicalJson");
const { redactForPersistence } = require("../security/redaction");
const { ReviewVerdict } = require("../agents/contracts");
const { YusufOSError, ErrorCodes } = require("../errors/YusufOSError");

/**
 * Owns the one thing Engineering must never be able to do: produce an
 * authoritative review verdict.
 *
 * Independence is enforced structurally, not by convention:
 *  1. A verdict can only attach to a run whose `runKind` is REVIEW *and*
 *     whose owning agent is the `reviewer` role in the database.
 *  2. `reviewRunId` is unique, so one review run yields exactly one verdict —
 *     a second submission cannot overwrite the first.
 *  3. Verdicts are append-only. Rework creates a *new* review run and a new
 *     verdict row; an earlier BLOCK is never deleted or mutated, so review
 *     history survives.
 *  4. Nothing here reads model prose for authority — the verdict value is
 *     validated against a closed enum and recorded against a proven identity.
 */
class ReviewService {
  constructor(db = prisma) {
    this.db = db;
    this.audit = new AuditService(db);
  }

  async submitVerdict({
    reviewRunId,
    targetRunId = null,
    rawVerdict,
    requestId,
  }) {
    const contract = ReviewVerdict(rawVerdict);

    const reviewRun = await this.db.yusuf_agent_runs.findUnique({
      where: { id: Number(reviewRunId) },
      include: { agent: true },
    });
    if (!reviewRun)
      throw new YusufOSError(ErrorCodes.NOT_FOUND, "Review run not found.", {
        status: 404,
      });
    if (reviewRun.runKind !== RUN_KINDS.REVIEW)
      throw new YusufOSError(
        ErrorCodes.UNAUTHORIZED,
        "A verdict may only be recorded against a REVIEW run.",
        { status: 403, details: { runKind: reviewRun.runKind } }
      );
    if (!reviewRun.agent || reviewRun.agent.key !== AGENT_KEYS.REVIEWER)
      throw new YusufOSError(
        ErrorCodes.UNAUTHORIZED,
        "Only the reviewer Agent may record a review verdict.",
        { status: 403, details: { agentKey: reviewRun.agent?.key || null } }
      );
    if (reviewRun.agent.status !== "ACTIVE")
      throw new YusufOSError(
        ErrorCodes.UNAUTHORIZED,
        "The reviewer Agent is not active.",
        { status: 403 }
      );
    if (targetRunId && Number(targetRunId) === Number(reviewRunId))
      throw new YusufOSError(
        ErrorCodes.VALIDATION_ERROR,
        "A review run cannot review itself.",
        { status: 422 }
      );

    // Bind the verdict to the exact evidence that existed when it was made, so
    // a later claim of "the reviewer approved this" can be checked against the
    // evidence set actually reviewed.
    const evidence = await this.db.yusuf_run_evidence.findMany({
      where: { taskId: reviewRun.taskId },
      orderBy: { id: "asc" },
      select: { digest: true, kind: true, status: true },
    });
    const evidenceDigest = canonicalHash(evidence);

    try {
      return await this.db.$transaction(async (tx) => {
        const created = await tx.yusuf_review_verdicts.create({
          data: {
            uuid: randomUUID(),
            taskId: reviewRun.taskId,
            reviewRunId: reviewRun.id,
            targetRunId: targetRunId ? Number(targetRunId) : null,
            reviewerAgentId: reviewRun.agentId,
            verdict: contract.verdict,
            summary: contract.summary.slice(0, 4000),
            findings: JSON.stringify(redactForPersistence(contract.findings)),
            evidenceDigest,
            requestId,
          },
        });
        await this.audit.appendInTransaction(tx, {
          eventType:
            contract.verdict === REVIEW_VERDICTS.BLOCK
              ? "review.blocked"
              : "review.passed",
          principal: { type: PRINCIPAL_TYPES.AGENT, id: reviewRun.agent.uuid },
          taskRef: reviewRun.taskId,
          runRef: reviewRun.id,
          outcome: contract.verdict,
          metadata: {
            verdictId: created.uuid,
            findingCount: contract.findings.length,
            evidenceDigest,
          },
          requestId,
        });
        return created;
      });
    } catch (error) {
      if (error?.code === "P2002")
        throw new YusufOSError(
          ErrorCodes.CONFLICT,
          "This review run already recorded a verdict; verdicts are immutable.",
          { status: 409 }
        );
      throw error;
    }
  }

  /** Full history, oldest first. A later PASS never erases an earlier BLOCK. */
  history(taskId) {
    return this.db.yusuf_review_verdicts.findMany({
      where: { taskId: Number(taskId) },
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * The verdict that currently governs the task: the most recent one. Used by
   * CompletionPolicy, which reads this table rather than any Agent's claim.
   */
  async latest(taskId) {
    const rows = await this.db.yusuf_review_verdicts.findMany({
      where: { taskId: Number(taskId) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 1,
    });
    return rows[0] || null;
  }
}

module.exports = { ReviewService };
