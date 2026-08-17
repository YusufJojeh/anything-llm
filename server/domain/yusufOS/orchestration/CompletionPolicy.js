const prisma = require("../../../utils/prisma");
const {
  REVIEW_VERDICTS,
  EVIDENCE_KINDS,
  APPROVAL_STATUSES,
  INTENT_STATUSES,
  POLICY_OUTCOMES,
} = require("../constants");
const { ReviewService } = require("../review/ReviewService");

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
    else if (
      implementation &&
      latestVerdict.createdAt < implementation.createdAt
    )
      // A PASS recorded before the newest implementation evidence did not see
      // that work; re-review is required rather than inheriting the old PASS.
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
    return {
      complete: unique.length === 0,
      blockers: unique,
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

module.exports = { CompletionPolicy, GATE_REASONS };
