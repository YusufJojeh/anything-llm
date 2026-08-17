const { randomUUID } = require("crypto");
const prisma = require("../../../utils/prisma");
const {
  INTENT_STATUSES,
  POLICY_OUTCOMES,
  PRINCIPAL_TYPES,
} = require("../constants");
const { ApprovalService } = require("../approvals/ApprovalService");
const { AuditService } = require("../audit/AuditService");
const { redactForPersistence, redactString } = require("../security/redaction");
const { canonicalize, canonicalHash } = require("../security/canonicalJson");
const { YusufOSError, ErrorCodes } = require("../errors/YusufOSError");

class ExecutionCoordinator {
  constructor({ db = prisma, adapter }) {
    this.db = db;
    this.adapter = adapter;
    this.approvals = new ApprovalService(db);
    this.audit = new AuditService(db);
  }

  async execute(intentId, context = {}) {
    const numericIntentId = Number(intentId);
    const existing = await this.db.yusuf_action_receipts.findUnique({
      where: { intentId: numericIntentId },
    });
    if (existing?.verificationStatus === "VERIFIED") return existing;
    if (existing) {
      if (
        existing.outcome === "EXECUTING" ||
        (existing.outcome === "SUCCEEDED" &&
          existing.verificationStatus === "PENDING")
      )
        await this.markUnknownForReconciliation(existing, context);
      throw new YusufOSError(
        ["EXECUTING", "SUCCEEDED", "UNKNOWN"].includes(existing.outcome)
          ? ErrorCodes.EXECUTION_UNKNOWN
          : ErrorCodes.IDEMPOTENCY_CONFLICT,
        "This intent already has an execution attempt and cannot be retried blindly.",
        {
          status: 409,
          details: { receiptId: existing.uuid, outcome: existing.outcome },
        }
      );
    }

    const intentSnapshot = await this.db.yusuf_action_intents.findUnique({
      where: { id: numericIntentId },
    });
    if (!intentSnapshot)
      throw new YusufOSError(ErrorCodes.NOT_FOUND, "Intent not found.", {
        status: 404,
      });

    const latestDecision = await this.db.yusuf_policy_decisions.findFirst({
      where: { intentId: numericIntentId },
      orderBy: { decisionVersion: "desc" },
    });
    if (latestDecision?.outcome === POLICY_OUTCOMES.FORBIDDEN)
      throw new YusufOSError(
        ErrorCodes.ACTION_FORBIDDEN,
        "This action is prohibited by a hard security invariant.",
        { status: 403 }
      );

    const availability = await this.adapter.availability(context);
    if (availability?.status !== "AVAILABLE")
      throw new YusufOSError(
        ErrorCodes.POLICY_DENIED,
        "The governed execution adapter is not available.",
        { status: 503, details: { availability: "UNAVAILABLE" } }
      );
    const preflight = await this.adapter.preflight(intentSnapshot, context);
    const accountIdentityDigest =
      preflight?.accountIdentity === null ||
      preflight?.accountIdentity === undefined
        ? null
        : canonicalHash(preflight.accountIdentity);
    if (
      availability.account !== null &&
      availability.account !== undefined &&
      canonicalHash(availability.account) !== accountIdentityDigest
    )
      throw new YusufOSError(
        ErrorCodes.POLICY_DENIED,
        "Adapter availability and preflight account identity do not match.",
        { status: 409 }
      );
    const governedPreflight = Object.freeze({
      resourceVersion: preflight?.resourceVersion ?? null,
      targetIdentityDigest: preflight?.targetIdentityDigest ?? null,
      accountIdentityDigest,
    });

    const claim = await this.db.$transaction(async (tx) => {
      const intent = await tx.yusuf_action_intents.findUnique({
        where: { id: numericIntentId },
        include: {
          approval: { include: { intent: true, policyDecision: true } },
          policyDecisions: { orderBy: { decisionVersion: "desc" }, take: 1 },
        },
      });
      const decision = intent?.policyDecisions[0];
      if (!intent || !decision)
        throw new YusufOSError(
          ErrorCodes.POLICY_DENIED,
          "Intent has no durable PolicyDecision.",
          { status: intent ? 409 : 404 }
        );

      const descriptor = this.adapter.descriptor();
      if (!descriptor.capabilities?.includes(intent.capabilityKey))
        throw new YusufOSError(
          ErrorCodes.POLICY_DENIED,
          "The selected adapter is not registered for this capability.",
          { status: 403 }
        );

      if (decision.outcome === POLICY_OUTCOMES.REQUIRE_APPROVAL) {
        if (!intent.approval)
          throw new YusufOSError(
            ErrorCodes.APPROVAL_REQUIRED,
            "Durable approval is required.",
            { status: 409 }
          );
        const consumed = await this.approvals.consumeInTransaction(
          tx,
          intent.approval,
          {
            governedPreflight,
            requestId: context.requestId || intent.requestId,
          }
        );
        if (!consumed.valid)
          return {
            blocked: {
              code: consumed.blocked
                ? ErrorCodes.MUTATIONS_DISABLED
                : consumed.expired
                  ? ErrorCodes.APPROVAL_EXPIRED
                  : ErrorCodes.APPROVAL_INVALIDATED,
              reason: consumed.reason,
            },
          };
      } else if (decision.outcome !== POLICY_OUTCOMES.ALLOW) {
        throw new YusufOSError(
          decision.outcome === POLICY_OUTCOMES.FORBIDDEN
            ? ErrorCodes.ACTION_FORBIDDEN
            : ErrorCodes.POLICY_DENIED,
          "Policy does not authorize execution.",
          { status: 403 }
        );
      }

      const transitioned = await tx.yusuf_action_intents.updateMany({
        where: {
          id: intent.id,
          status: {
            in: [INTENT_STATUSES.AUTHORIZED, INTENT_STATUSES.WAITING_APPROVAL],
          },
          version: intent.version,
        },
        data: { status: INTENT_STATUSES.EXECUTING, version: { increment: 1 } },
      });
      if (transitioned.count !== 1)
        throw new YusufOSError(
          ErrorCodes.IDEMPOTENCY_CONFLICT,
          "Intent execution was claimed concurrently or its state changed.",
          { status: 409 }
        );
      await tx.yusuf_agent_runs.updateMany({
        where: { id: intent.runId, status: "WAITING_APPROVAL" },
        data: { status: "RUNNING", version: { increment: 1 } },
      });

      const executionKey = randomUUID();
      const receipt = await tx.yusuf_action_receipts.create({
        data: {
          uuid: randomUUID(),
          intentId: intent.id,
          executionAttempt: 1,
          executionKey,
          adapterKind: descriptor.kind,
          adapterId: descriptor.id,
          safeAccountIdentity:
            preflight?.accountIdentity === null ||
            preflight?.accountIdentity === undefined
              ? null
              : canonicalize(redactForPersistence(preflight.accountIdentity)),
          outcome: "EXECUTING",
          verificationStatus: "PENDING",
          requestId: context.requestId || intent.requestId,
        },
      });
      await this.audit.appendInTransaction(tx, {
        eventType: "execution.claimed",
        principal: {
          type: PRINCIPAL_TYPES.SYSTEM,
          id: "execution-coordinator",
        },
        taskRef: intent.taskId,
        runRef: intent.runId,
        intentRef: intent.uuid,
        outcome: INTENT_STATUSES.EXECUTING,
        metadata: { receiptId: receipt.uuid, adapterKind: descriptor.kind },
        requestId: context.requestId || intent.requestId,
      });
      return { intent, receipt, executionKey };
    });

    if (claim.blocked)
      throw new YusufOSError(
        claim.blocked.code,
        claim.blocked.code === ErrorCodes.MUTATIONS_DISABLED
          ? "External mutations are disabled. Approval was not consumed."
          : claim.blocked.code === ErrorCodes.APPROVAL_EXPIRED
            ? "Approval expired before execution."
            : "Approval was invalidated during execution preflight.",
        { status: 409, details: { reason: claim.blocked.reason } }
      );

    let executionResult;
    try {
      const prepared = await this.adapter.prepare(claim.intent, context);
      executionResult = await this.adapter.execute(prepared, {
        intentId: claim.intent.id,
        executionKey: claim.executionKey,
        attempt: 1,
      });
    } catch (error) {
      return this.finalizeFailure(
        claim,
        error,
        error.effectCertain !== true,
        context
      );
    }

    await this.persistExecutionResult(claim, executionResult);
    try {
      const verification = await this.adapter.verify(
        claim.intent,
        executionResult,
        context
      );
      return this.finalizeVerification(claim, verification, context, {
        expectedReceiptVersion: 2,
        expectedVerificationStatus: "PENDING",
      });
    } catch (error) {
      return this.finalizeVerification(
        claim,
        {
          status: "UNKNOWN",
          result: { error: error.message },
          evidence: [],
        },
        context,
        { expectedReceiptVersion: 2, expectedVerificationStatus: "PENDING" }
      );
    }
  }

  async persistExecutionResult(claim, executionResult) {
    return this.db.$transaction(async (tx) => {
      const receipt = await tx.yusuf_action_receipts.updateMany({
        where: {
          id: claim.receipt.id,
          outcome: "EXECUTING",
          verificationStatus: "PENDING",
          version: claim.receipt.version,
        },
        data: {
          outcome: "SUCCEEDED",
          externalReference: executionResult.externalReference
            ? redactString(String(executionResult.externalReference))
            : null,
          sanitizedResult: JSON.stringify(
            redactForPersistence(executionResult.result || {})
          ),
          version: { increment: 1 },
        },
      });
      const intent = await tx.yusuf_action_intents.updateMany({
        where: { id: claim.intent.id, status: INTENT_STATUSES.EXECUTING },
        data: {
          status: INTENT_STATUSES.EXECUTED_UNVERIFIED,
          version: { increment: 1 },
        },
      });
      if (receipt.count !== 1 || intent.count !== 1)
        throw new YusufOSError(
          ErrorCodes.IDEMPOTENCY_CONFLICT,
          "Execution result persistence lost its state ownership.",
          { status: 409 }
        );
    });
  }

  async finalizeFailure(claim, error, unknown, context) {
    const status = unknown
      ? INTENT_STATUSES.FAILED_UNKNOWN
      : INTENT_STATUSES.FAILED;
    return this.db.$transaction(async (tx) => {
      const intent = await tx.yusuf_action_intents.updateMany({
        where: { id: claim.intent.id, status: INTENT_STATUSES.EXECUTING },
        data: { status, version: { increment: 1 } },
      });
      const receiptUpdate = await tx.yusuf_action_receipts.updateMany({
        where: {
          id: claim.receipt.id,
          outcome: "EXECUTING",
          verificationStatus: "PENDING",
          version: claim.receipt.version,
        },
        data: {
          outcome: unknown ? "UNKNOWN" : "FAILED",
          verificationStatus: unknown ? "UNKNOWN" : "NOT_APPLIED",
          sanitizedResult: JSON.stringify(
            redactForPersistence({ error: error.message })
          ),
          completedAt: new Date(),
          version: { increment: 1 },
        },
      });
      if (intent.count !== 1 || receiptUpdate.count !== 1)
        throw new YusufOSError(
          ErrorCodes.IDEMPOTENCY_CONFLICT,
          "Execution failure finalization lost its state ownership.",
          { status: 409 }
        );
      await tx.yusuf_agent_runs.updateMany({
        where: { id: claim.intent.runId, status: "RUNNING" },
        data: {
          status: unknown ? "FAILED_UNKNOWN" : "FAILED",
          version: { increment: 1 },
        },
      });
      const receipt = await tx.yusuf_action_receipts.findUnique({
        where: { id: claim.receipt.id },
      });
      await this.audit.appendInTransaction(tx, {
        eventType: "execution.failed",
        principal: {
          type: PRINCIPAL_TYPES.SYSTEM,
          id: "execution-coordinator",
        },
        runRef: claim.intent.runId,
        intentRef: claim.intent.uuid,
        outcome: status,
        metadata: { receiptId: receipt.uuid, unknown },
        requestId: context.requestId || claim.intent.requestId,
      });
      return receipt;
    });
  }

  async finalizeVerification(
    claim,
    verification,
    context,
    { expectedReceiptVersion, expectedVerificationStatus }
  ) {
    const normalizedStatus = ["VERIFIED", "NOT_APPLIED"].includes(
      verification.status
    )
      ? verification.status
      : "UNKNOWN";
    const status =
      normalizedStatus === "VERIFIED"
        ? INTENT_STATUSES.VERIFIED
        : normalizedStatus === "NOT_APPLIED"
          ? INTENT_STATUSES.FAILED
          : INTENT_STATUSES.FAILED_UNKNOWN;
    return this.db.$transaction(async (tx) => {
      const intentUpdate = await tx.yusuf_action_intents.updateMany({
        where: {
          id: claim.intent.id,
          status: {
            in: [
              INTENT_STATUSES.EXECUTED_UNVERIFIED,
              INTENT_STATUSES.FAILED_UNKNOWN,
            ],
          },
        },
        data: { status, version: { increment: 1 } },
      });
      const receiptUpdate = await tx.yusuf_action_receipts.updateMany({
        where: {
          id: claim.receipt.id,
          version: expectedReceiptVersion,
          verificationStatus: expectedVerificationStatus,
        },
        data: {
          outcome:
            status === INTENT_STATUSES.FAILED_UNKNOWN
              ? "UNKNOWN"
              : status === INTENT_STATUSES.FAILED
                ? "FAILED"
                : "SUCCEEDED",
          verificationStatus: normalizedStatus,
          verificationResult: JSON.stringify(
            redactForPersistence(verification.result || {})
          ),
          evidenceRefs: JSON.stringify(
            redactForPersistence(verification.evidence || [])
          ),
          completedAt: new Date(),
          version: { increment: 1 },
        },
      });
      if (intentUpdate.count !== 1 || receiptUpdate.count !== 1)
        throw new YusufOSError(
          ErrorCodes.IDEMPOTENCY_CONFLICT,
          "Verification finalization lost its state ownership.",
          { status: 409 }
        );
      if (status !== INTENT_STATUSES.VERIFIED)
        await tx.yusuf_agent_runs.updateMany({
          where: {
            id: claim.intent.runId,
            status: { in: ["RUNNING", "FAILED_UNKNOWN"] },
          },
          data: {
            status:
              status === INTENT_STATUSES.FAILED_UNKNOWN
                ? "FAILED_UNKNOWN"
                : "FAILED",
            version: { increment: 1 },
          },
        });
      else
        await tx.yusuf_agent_runs.updateMany({
          where: { id: claim.intent.runId, status: "FAILED_UNKNOWN" },
          data: { status: "RUNNING", version: { increment: 1 } },
        });
      const receipt = await tx.yusuf_action_receipts.findUnique({
        where: { id: claim.receipt.id },
      });
      await this.audit.appendInTransaction(tx, {
        eventType: "execution.verified",
        principal: { type: PRINCIPAL_TYPES.SYSTEM, id: "verification-service" },
        runRef: claim.intent.runId,
        intentRef: claim.intent.uuid,
        outcome: status,
        metadata: {
          receiptId: receipt.uuid,
          verificationStatus: normalizedStatus,
        },
        requestId: context.requestId || claim.intent.requestId,
      });
      return receipt;
    });
  }

  async markUnknownForReconciliation(existing, context = {}) {
    return this.db.$transaction(async (tx) => {
      const receiptUpdate = await tx.yusuf_action_receipts.updateMany({
        where: {
          id: existing.id,
          version: existing.version,
          verificationStatus: "PENDING",
          outcome: { in: ["EXECUTING", "SUCCEEDED"] },
        },
        data: {
          outcome: "UNKNOWN",
          verificationStatus: "UNKNOWN",
          version: { increment: 1 },
        },
      });
      if (receiptUpdate.count !== 1) return false;
      const intent = await tx.yusuf_action_intents.findUnique({
        where: { id: existing.intentId },
      });
      await tx.yusuf_action_intents.updateMany({
        where: {
          id: existing.intentId,
          status: {
            in: [
              INTENT_STATUSES.EXECUTING,
              INTENT_STATUSES.EXECUTED_UNVERIFIED,
            ],
          },
        },
        data: {
          status: INTENT_STATUSES.FAILED_UNKNOWN,
          version: { increment: 1 },
        },
      });
      await tx.yusuf_agent_runs.updateMany({
        where: { id: intent.runId, status: "RUNNING" },
        data: { status: "FAILED_UNKNOWN", version: { increment: 1 } },
      });
      await this.audit.appendInTransaction(tx, {
        eventType: "execution.recovery_required",
        principal: {
          type: PRINCIPAL_TYPES.SYSTEM,
          id: "execution-coordinator",
        },
        runRef: intent.runId,
        intentRef: intent.uuid,
        outcome: INTENT_STATUSES.FAILED_UNKNOWN,
        metadata: { receiptId: existing.uuid },
        requestId: context.requestId || existing.requestId,
      });
      return true;
    });
  }

  async reconcile(intentId, context = {}) {
    const claim = await this.db.$transaction(async (tx) => {
      const receipt = await tx.yusuf_action_receipts.findUnique({
        where: { intentId: Number(intentId) },
        include: { intent: true },
      });
      if (
        !receipt ||
        receipt.outcome !== "UNKNOWN" ||
        receipt.verificationStatus !== "UNKNOWN" ||
        receipt.intent.status !== INTENT_STATUSES.FAILED_UNKNOWN
      )
        throw new YusufOSError(
          ErrorCodes.INVALID_STATE_TRANSITION,
          "Only an unknown execution outcome may be reconciled.",
          { status: 409 }
        );
      const claimed = await tx.yusuf_action_receipts.updateMany({
        where: {
          id: receipt.id,
          version: receipt.version,
          outcome: "UNKNOWN",
          verificationStatus: "UNKNOWN",
        },
        data: {
          verificationStatus: "RECONCILING",
          version: { increment: 1 },
        },
      });
      if (claimed.count !== 1)
        throw new YusufOSError(
          ErrorCodes.IDEMPOTENCY_CONFLICT,
          "Reconciliation was claimed concurrently.",
          { status: 409 }
        );
      return { intent: receipt.intent, receipt };
    });

    let result;
    try {
      result = await this.adapter.reconcile(claim.intent, {
        executionKey: claim.receipt.executionKey,
        attempt: claim.receipt.executionAttempt,
      });
    } catch {
      await this.db.yusuf_action_receipts.updateMany({
        where: {
          id: claim.receipt.id,
          version: claim.receipt.version + 1,
          verificationStatus: "RECONCILING",
        },
        data: {
          verificationStatus: "UNKNOWN",
          version: { increment: 1 },
        },
      });
      throw new YusufOSError(
        ErrorCodes.EXECUTION_UNKNOWN,
        "Reconciliation failed; the effect remains unknown.",
        { status: 409 }
      );
    }
    return this.finalizeVerification(
      claim,
      { status: result.status, result, evidence: [] },
      context,
      {
        expectedReceiptVersion: claim.receipt.version + 1,
        expectedVerificationStatus: "RECONCILING",
      }
    );
  }
}

module.exports = { ExecutionCoordinator };
