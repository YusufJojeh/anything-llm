const prisma = require("../../../utils/prisma");
const {
  REVIEW_VERDICTS,
  EVIDENCE_KINDS,
  APPROVAL_STATUSES,
  INTENT_STATUSES,
  POLICY_OUTCOMES,
} = require("../constants");
const { ReviewService } = require("../review/ReviewService");
const { canonicalHash } = require("../security/canonicalJson");

// The fixed set of gates every task is measured against, and which blocker
// belongs to which gate. Gate F's `runProgress` reports real satisfied/total
// counts from this map rather than inventing a progress percentage.
const CORE_GATES = Object.freeze([
  "implementation",
  "validation",
  "review",
  "approvals",
  "security",
  "externalEffects",
]);

const BLOCKER_GATE = Object.freeze({
  NO_IMPLEMENTATION_EVIDENCE: "implementation",
  NO_VALIDATION_EVIDENCE: "validation",
  VALIDATION_FAILED: "validation",
  NO_REVIEW: "review",
  REVIEW_BLOCKED: "review",
  REVIEW_STALE: "review",
  APPROVAL_PENDING: "approvals",
  SECURITY_BLOCKER: "security",
  EXTERNAL_EFFECT_UNVERIFIED: "externalEffects",
});

const GATE_REASONS = Object.freeze({
  NO_IMPLEMENTATION_EVIDENCE: "NO_IMPLEMENTATION_EVIDENCE",
  NO_VALIDATION_EVIDENCE: "NO_VALIDATION_EVIDENCE",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  NO_REVIEW: "NO_REVIEW",
  REVIEW_BLOCKED: "REVIEW_BLOCKED",
  REVIEW_STALE: "REVIEW_STALE",
  APPROVAL_PENDING: "APPROVAL_PENDING",
  SECURITY_BLOCKER: "SECURITY_BLOCKER",
  EXTERNAL_EFFECT_UNVERIFIED: "EXTERNAL_EFFECT_UNVERIFIED",
});

/**
 * The deterministic completion gate.
 *
 * Nothing here consults Agent narrative. An Engineering run that returns
 * "done", or a plan that asserts `claimedComplete: true`, has no effect on
 * this function's answer — it reads only persisted, server-owned state:
 * evidence rows, review verdicts, approval/intent records.
 */
class CompletionPolicy {
  constructor(db = prisma) {
    this.db = db;
    this.reviews = new ReviewService(db);
  }

  /**
   * Decides whether the governing verdict still describes the task's current
   * state.
   *
   * Two independent signals, because either alone is forgeable or incomplete:
   *  1. The evidence digest recorded at verdict time must still match the
   *     task's evidence set. ReviewService binds the verdict to exactly what
   *     was reviewed; verifying it here is what makes that binding meaningful
   *     rather than decorative.
   *  2. No governed mutation receipt may be newer than the verdict. Receipts
   *     are created by the Execution Coordinator, not by an Agent, so this
   *     catches work performed *after* a PASS even when the Agent simply
   *     declines to record evidence for it — self-reported evidence rows
   *     cannot be the only staleness signal.
   *
   * Ordering uses monotonic ids rather than `createdAt`, because SQLite's
   * CURRENT_TIMESTAMP has one-second resolution and same-second work would
   * otherwise slip past a timestamp comparison.
   */
  async #reviewIsStale(taskId, verdict) {
    const evidence = await this.db.yusuf_run_evidence.findMany({
      where: { taskId },
      orderBy: { id: "asc" },
      select: { digest: true, kind: true, status: true },
    });
    if (canonicalHash(evidence) !== verdict.evidenceDigest) return true;

    const mutationAfterVerdict = await this.db.yusuf_action_receipts.findFirst({
      where: {
        intent: { taskId },
        id: { gt: 0 },
        completedAt: { gt: verdict.createdAt },
      },
      select: { id: true },
    });
    return Boolean(mutationAfterVerdict);
  }

  async evaluate(taskId) {
    const numericTaskId = Number(taskId);
    const blockers = [];

    const [implementation, validations, latestVerdict, intents] =
      await Promise.all([
        this.db.yusuf_run_evidence.findFirst({
          where: { taskId: numericTaskId, kind: EVIDENCE_KINDS.IMPLEMENTATION },
          orderBy: { id: "desc" },
        }),
        this.db.yusuf_run_evidence.findMany({
          where: { taskId: numericTaskId, kind: EVIDENCE_KINDS.VALIDATION },
          orderBy: { id: "asc" },
        }),
        this.reviews.latest(numericTaskId),
        this.db.yusuf_action_intents.findMany({
          where: { taskId: numericTaskId },
          include: { approval: true, receipt: true, policyDecisions: true },
        }),
      ]);

    if (!implementation) blockers.push(GATE_REASONS.NO_IMPLEMENTATION_EVIDENCE);

    if (validations.length === 0)
      blockers.push(GATE_REASONS.NO_VALIDATION_EVIDENCE);
    else {
      const latestValidation = validations[validations.length - 1];
      if (latestValidation.status !== "PASSED")
        blockers.push(GATE_REASONS.VALIDATION_FAILED);
    }

    if (!latestVerdict) blockers.push(GATE_REASONS.NO_REVIEW);
    else if (latestVerdict.verdict === REVIEW_VERDICTS.BLOCK)
      blockers.push(GATE_REASONS.REVIEW_BLOCKED);
    else if (await this.#reviewIsStale(numericTaskId, latestVerdict))
      blockers.push(GATE_REASONS.REVIEW_STALE);

    for (const intent of intents) {
      const decision = [...(intent.policyDecisions || [])].sort(
        (a, b) => b.decisionVersion - a.decisionVersion
      )[0];
      if (decision?.outcome === POLICY_OUTCOMES.FORBIDDEN)
        blockers.push(GATE_REASONS.SECURITY_BLOCKER);

      if (
        intent.approval &&
        [APPROVAL_STATUSES.PENDING, APPROVAL_STATUSES.APPROVED].includes(
          intent.approval.status
        )
      )
        // Approved-but-not-consumed still means the authorized effect has not
        // happened yet, so the task is not finished.
        blockers.push(GATE_REASONS.APPROVAL_PENDING);

      if (
        [
          INTENT_STATUSES.EXECUTING,
          INTENT_STATUSES.EXECUTED_UNVERIFIED,
          INTENT_STATUSES.FAILED_UNKNOWN,
        ].includes(intent.status)
      )
        blockers.push(GATE_REASONS.EXTERNAL_EFFECT_UNVERIFIED);
    }

    const unique = [...new Set(blockers)];
    const failedGates = new Set(
      unique.map((reason) => BLOCKER_GATE[reason]).filter(Boolean)
    );
    return {
      complete: unique.length === 0,
      blockers: unique,
      gates: {
        total: CORE_GATES.length,
        satisfied: CORE_GATES.length - failedGates.size,
        failed: [...failedGates],
      },
      reviewVerdict: latestVerdict?.verdict || null,
      // PASS_WITH_WARNINGS completes the task but is surfaced explicitly so a
      // future Command Center (and Yusuf) can see it was not a clean PASS.
      warnings:
        latestVerdict?.verdict === REVIEW_VERDICTS.PASS_WITH_WARNINGS
          ? JSON.parse(latestVerdict.findings || "[]")
          : [],
    };
  }
}

module.exports = { CompletionPolicy, GATE_REASONS, CORE_GATES, BLOCKER_GATE };
