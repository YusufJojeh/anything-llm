const { randomUUID } = require("crypto");
const prisma = require("../../../utils/prisma");
const {
  RUN_STATUSES,
  RUN_KINDS,
  PRINCIPAL_TYPES,
  EVIDENCE_KINDS,
  EVIDENCE_CLASSES,
  EVIDENCE_RETENTION_DAYS,
} = require("../constants");
const { AuditService } = require("../audit/AuditService");
const { canonicalHash } = require("../security/canonicalJson");
const { redactForPersistence } = require("../security/redaction");
const { conditionalTransition } = require("../state/transitions");
const { YusufOSError, ErrorCodes } = require("../errors/YusufOSError");
const { CONFIDENCE } = require("../models/constants");
const CONFIDENCE_UNAVAILABLE = CONFIDENCE.UNAVAILABLE;

/**
 * Owns AgentRun lifecycle: creation (idempotent), start (concurrency-limited),
 * waiting states, evidence recording, and terminal transitions.
 *
 * Deliberately narrow — it does not decide *what* an Agent should do (that is
 * ChiefOfStaff) and does not judge outcomes (that is ReviewService /
 * CompletionPolicy). Keeping these separate is what stops a single
 * "AgentManager" from accumulating every authority in the system.
 */
class AgentRunCoordinator {
  constructor(db = prisma) {
    this.db = db;
    this.audit = new AuditService(db);
  }

  /**
   * Creates a run, or returns the existing one for the same logical work.
   * The idempotency key is server-derived, so an at-least-once orchestration
   * retry can never produce two active runs for the same task/agent/purpose.
   */
  async createRun({
    taskId,
    agentId,
    runKind = RUN_KINDS.EXECUTION,
    principal,
    requestId,
    attempt = 1,
    modelRef = null,
    promptDigest = null,
    deferStart = false,
  }) {
    const idempotencyKey = canonicalHash({
      taskId: Number(taskId),
      agentId: Number(agentId),
      runKind,
      attempt: Number(attempt),
      deferStart: Boolean(deferStart),
    });
    try {
      const run = await this.db.$transaction(async (tx) => {
        const created = await tx.yusuf_agent_runs.create({
          data: {
            uuid: randomUUID(),
            taskId: Number(taskId),
            agentId: Number(agentId),
            requestedByPrincipalType: principal.type,
            requestedByPrincipalId: String(principal.id),
            status: deferStart
              ? RUN_STATUSES.WAITING_DEPENDENCY
              : RUN_STATUSES.QUEUED,
            runKind,
            idempotencyKey,
            // Completion provenance is reserved for
            // recordModelCompletion(); callers may record intended identity
            // here but cannot pre-mark a run as a completed model call.
            modelRef:
              modelRef && typeof modelRef === "object"
                ? JSON.stringify({
                    provider: String(modelRef.provider || "unknown"),
                    model: String(modelRef.model || "unknown"),
                  })
                : null,
            promptDigest,
            requestId,
          },
        });
        await this.audit.appendInTransaction(tx, {
          eventType: "agent.run.created",
          principal,
          taskRef: taskId,
          runRef: created.id,
          outcome: created.status,
          metadata: { runKind, attempt, runId: created.uuid, deferStart },
          requestId,
        });
        return created;
      });
      return run;
    } catch (error) {
      if (error?.code !== "P2002") throw error;
      return this.db.yusuf_agent_runs.findUnique({ where: { idempotencyKey } });
    }
  }

  /**
   * Atomically parks the source and releases a deferred successor. Until this
   * transaction commits, startRun() cannot claim the successor because it is
   * WAITING_DEPENDENCY rather than QUEUED.
   */
  async activateHandoff({ sourceRunId, targetRunId, requestId }) {
    return this.db.$transaction(async (tx) => {
      const [source, target] = await Promise.all([
        tx.yusuf_agent_runs.findUnique({ where: { id: Number(sourceRunId) } }),
        tx.yusuf_agent_runs.findUnique({ where: { id: Number(targetRunId) } }),
      ]);
      if (!source || !target)
        throw new YusufOSError(
          ErrorCodes.NOT_FOUND,
          "Handoff source or target run was not found.",
          { status: 404 }
        );
      const sourceUpdate = await tx.yusuf_agent_runs.updateMany({
        where: {
          id: source.id,
          version: source.version,
          status: RUN_STATUSES.RUNNING,
        },
        data: {
          status: RUN_STATUSES.WAITING_HANDOFF,
          version: { increment: 1 },
        },
      });
      const targetUpdate = await tx.yusuf_agent_runs.updateMany({
        where: {
          id: target.id,
          version: target.version,
          status: RUN_STATUSES.WAITING_DEPENDENCY,
        },
        data: {
          status: RUN_STATUSES.QUEUED,
          version: { increment: 1 },
        },
      });
      if (sourceUpdate.count !== 1 || targetUpdate.count !== 1)
        throw new YusufOSError(
          ErrorCodes.CONFLICT,
          "Handoff activation lost run-state ownership.",
          { status: 409 }
        );
      await this.audit.appendInTransaction(tx, {
        eventType: "agent.run.waiting_handoff",
        principal: {
          type: PRINCIPAL_TYPES.SYSTEM,
          id: "agent-run-coordinator",
        },
        taskRef: source.taskId,
        runRef: source.id,
        outcome: RUN_STATUSES.WAITING_HANDOFF,
        metadata: { targetRunId: target.uuid },
        requestId: requestId || source.requestId,
      });
      await this.audit.appendInTransaction(tx, {
        eventType: "agent.run.handoff_released",
        principal: {
          type: PRINCIPAL_TYPES.SYSTEM,
          id: "agent-run-coordinator",
        },
        taskRef: target.taskId,
        runRef: target.id,
        outcome: RUN_STATUSES.QUEUED,
        metadata: { sourceRunId: source.uuid },
        requestId: requestId || target.requestId,
      });
      return { sourceRun: source.id, targetRun: target.id };
    });
  }

  async terminalizeReasoningFailure({
    runId,
    leaseId,
    cancelled,
    failureKind,
    message,
    requestId,
  }) {
    return this.db.$transaction(async (tx) => {
      const run = await tx.yusuf_agent_runs.findUnique({
        where: { id: Number(runId) },
      });
      if (!run || run.reasoningLeaseId !== leaseId) return false;
      const terminalStatus = cancelled
        ? RUN_STATUSES.CANCELLED
        : RUN_STATUSES.FAILED;
      const updated = await tx.yusuf_agent_runs.updateMany({
        where: {
          id: run.id,
          version: run.version,
          reasoningLeaseId: leaseId,
          status: {
            in: [
              RUN_STATUSES.RUNNING,
              RUN_STATUSES.WAITING_TOOL,
              RUN_STATUSES.VERIFYING,
            ],
          },
        },
        data: {
          status: terminalStatus,
          failureKind: cancelled ? null : failureKind,
          blockedReason: cancelled
            ? null
            : String(message || "").slice(0, 1000),
          completedAt: new Date(),
          reasoningLeaseId: null,
          reasoningLeaseExpiresAt: null,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) return false;
      await this.audit.appendInTransaction(tx, {
        eventType: cancelled ? "agent.run.cancelled" : "agent.run.failed",
        principal: {
          type: PRINCIPAL_TYPES.SYSTEM,
          id: "agent-run-coordinator",
        },
        taskRef: run.taskId,
        runRef: run.id,
        outcome: terminalStatus,
        metadata: cancelled
          ? {}
          : redactForPersistence({ failureKind, reason: message }),
        requestId: requestId || run.requestId,
      });
      return true;
    });
  }

  async recordRoutedReviewDecision({ runId, leaseId, decision }) {
    const digest = canonicalHash(decision);
    const updated = await this.db.yusuf_agent_runs.updateMany({
      where: {
        id: Number(runId),
        status: RUN_STATUSES.RUNNING,
        reasoningLeaseId: leaseId,
        runKind: RUN_KINDS.REVIEW,
        modelRef: { not: null },
        promptDigest: { not: null },
      },
      data: { reviewDecisionDigest: digest },
    });
    if (updated.count !== 1)
      throw new YusufOSError(
        ErrorCodes.UNAUTHORIZED,
        "A review verdict requires a current routed-completion lease.",
        { status: 403 }
      );
    return digest;
  }

  /**
   * Moves QUEUED -> RUNNING, refusing to exceed the Agent's declared
   * concurrency. The limit is enforced with a conditional transition against
   * durable state rather than an in-process lock, so it still holds across
   * worker processes and restarts.
   */
  async startRun({ runId, requestId }) {
    const run = await this.db.yusuf_agent_runs.findUnique({
      where: { id: Number(runId) },
      include: { agent: true },
    });
    if (!run)
      throw new YusufOSError(ErrorCodes.NOT_FOUND, "Run not found.", {
        status: 404,
      });
    if (run.status !== RUN_STATUSES.QUEUED)
      throw new YusufOSError(
        ErrorCodes.INVALID_STATE_TRANSITION,
        "Only a queued run can be started.",
        { status: 409, details: { status: run.status } }
      );

    const maxConcurrent = run.agent?.maxConcurrentRuns || 1;
    // The active-run count and the QUEUED -> RUNNING transition must be one
    // atomic unit. Two different QUEUED runs for the same agent, started
    // concurrently, would otherwise both read the same `active` count before
    // either commits its own transition, letting both past a
    // `maxConcurrentRuns: 1` cap even though each transition is individually
    // version-guarded. Wrapping both in one transaction closes that gap the
    // same way ExecutionCoordinator's claim transaction does for execution.
    await this.db.$transaction(async (tx) => {
      const active = await tx.yusuf_agent_runs.count({
        where: {
          agentId: run.agentId,
          status: {
            in: [
              RUN_STATUSES.RUNNING,
              RUN_STATUSES.WAITING_TOOL,
              RUN_STATUSES.VERIFYING,
            ],
          },
        },
      });
      if (active >= maxConcurrent)
        throw new YusufOSError(
          ErrorCodes.CONFLICT,
          "The Agent is at its concurrent run limit.",
          { status: 409, details: { active, maxConcurrent } }
        );

      await conditionalTransition({
        delegate: tx.yusuf_agent_runs,
        id: run.id,
        version: run.version,
        from: RUN_STATUSES.QUEUED,
        to: RUN_STATUSES.RUNNING,
        machine: "run",
        data: { startedAt: new Date() },
      });
    });
    await this.audit.append({
      eventType: "agent.run.started",
      principal: {
        type: run.requestedByPrincipalType,
        id: run.requestedByPrincipalId,
      },
      taskRef: run.taskId,
      runRef: run.id,
      outcome: RUN_STATUSES.RUNNING,
      metadata: { runKind: run.runKind },
      requestId: requestId || run.requestId,
    });
    return this.db.yusuf_agent_runs.findUnique({ where: { id: run.id } });
  }

  async transition({ runId, to, data = {}, requestId, eventType }) {
    const run = await this.db.yusuf_agent_runs.findUnique({
      where: { id: Number(runId) },
    });
    if (!run)
      throw new YusufOSError(ErrorCodes.NOT_FOUND, "Run not found.", {
        status: 404,
      });
    await conditionalTransition({
      delegate: this.db.yusuf_agent_runs,
      id: run.id,
      version: run.version,
      from: run.status,
      to,
      machine: "run",
      data,
    });
    await this.audit.append({
      eventType: eventType || `agent.run.${to.toLowerCase()}`,
      principal: { type: PRINCIPAL_TYPES.SYSTEM, id: "agent-run-coordinator" },
      taskRef: run.taskId,
      runRef: run.id,
      outcome: to,
      metadata: redactForPersistence(data),
      requestId: requestId || run.requestId,
    });
    return this.db.yusuf_agent_runs.findUnique({ where: { id: run.id } });
  }

  /**
   * Records structured evidence. This is what completion gates read — an
   * Agent's prose claim of success has no standing without a row here, and
   * validation evidence carries the real exit status rather than a summary
   * the Agent chose.
   */
  async recordEvidence({
    runId,
    taskId,
    kind,
    status,
    summary,
    payload = {},
    intentUuid = null,
    evidenceClass = EVIDENCE_CLASSES.SANITIZED_OUTPUT,
  }) {
    if (!Object.values(EVIDENCE_KINDS).includes(kind))
      throw new YusufOSError(
        ErrorCodes.VALIDATION_ERROR,
        `Unknown evidence kind: ${kind}`,
        { status: 422 }
      );
    if (!Object.values(EVIDENCE_CLASSES).includes(evidenceClass))
      throw new YusufOSError(
        ErrorCodes.VALIDATION_ERROR,
        `Unknown evidence class: ${evidenceClass}`,
        { status: 422 }
      );
    // ADR-008: secrets are never persisted. This is a refusal, not a
    // zero-day retention policy — SECRET_FORBIDDEN exists in the enum only so
    // a caller can name what it is refusing.
    if (evidenceClass === EVIDENCE_CLASSES.SECRET_FORBIDDEN)
      throw new YusufOSError(
        ErrorCodes.ACTION_FORBIDDEN,
        "Evidence classified SECRET_FORBIDDEN cannot be persisted.",
        { status: 403 }
      );

    // Evidence must belong to the task whose completion gate will read it.
    // Without this, evidence produced under one task's run could be filed
    // against a different task and satisfy that task's gate.
    const run = await this.db.yusuf_agent_runs.findUnique({
      where: { id: Number(runId) },
    });
    if (!run)
      throw new YusufOSError(ErrorCodes.NOT_FOUND, "Run not found.", {
        status: 404,
      });
    if (Number(run.taskId) !== Number(taskId))
      throw new YusufOSError(
        ErrorCodes.UNAUTHORIZED,
        "Evidence must be recorded against the task that owns the run.",
        { status: 403, details: { runTaskId: run.taskId, taskId } }
      );

    let resolvedStatus = status;
    if (kind === EVIDENCE_KINDS.VALIDATION) {
      // Validation is the one evidence kind a completion gate treats as proof,
      // so its outcome is derived from the governed ActionReceipt rather than
      // asserted by the caller. Otherwise an Agent (or an agent-driven loop
      // that let the model choose) could file a PASSED for a run that failed —
      // exactly the self-certification this gate exists to prevent.
      if (!intentUuid)
        throw new YusufOSError(
          ErrorCodes.VALIDATION_ERROR,
          "Validation evidence must reference the intent whose receipt proves it.",
          { status: 422 }
        );
      const intent = await this.db.yusuf_action_intents.findUnique({
        where: { uuid: String(intentUuid) },
        include: { receipt: true },
      });
      if (!intent || Number(intent.taskId) !== Number(taskId))
        throw new YusufOSError(
          ErrorCodes.UNAUTHORIZED,
          "The referenced intent does not belong to this task.",
          { status: 403 }
        );
      if (!intent.receipt)
        throw new YusufOSError(
          ErrorCodes.VALIDATION_ERROR,
          "The referenced intent has no execution receipt to prove validation.",
          { status: 409 }
        );
      const result = JSON.parse(intent.receipt.sanitizedResult || "{}");
      resolvedStatus =
        intent.receipt.verificationStatus === "VERIFIED" &&
        result.passed === true
          ? "PASSED"
          : "FAILED";
      payload = {
        ...payload,
        intentUuid: intent.uuid,
        exitCode: result.exitCode,
      };
    }

    const sanitized = redactForPersistence(payload);
    const retentionDays = EVIDENCE_RETENTION_DAYS[evidenceClass];
    const expiresAt = retentionDays
      ? new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000)
      : null;
    return this.db.yusuf_run_evidence.create({
      data: {
        uuid: randomUUID(),
        runId: Number(runId),
        taskId: Number(taskId),
        kind,
        status: resolvedStatus,
        summary: String(summary).slice(0, 4000),
        payload: JSON.stringify(sanitized),
        evidenceClass,
        expiresAt,
        digest: canonicalHash({
          kind,
          status: resolvedStatus,
          payload: sanitized,
        }),
      },
    });
  }

  /**
   * Records model/usage telemetry for future cost visibility.
   *
   * Usage is coerced to a fixed set of finite numbers rather than passed
   * through `redactForPersistence`: the redactor matches on key *names*, and
   * "promptTokens"/"totalTokens" legitimately contain "token", so a generic
   * redaction pass would blank real counts. Numeric-only coercion is safe by
   * construction — a number cannot carry a credential — and keeps the
   * telemetry usable.
   */
  async recordTelemetry({
    runId,
    modelRef,
    usage,
    estimatedCostMicros = null,
  }) {
    let tokenUsage;
    if (usage) {
      const numeric = {};
      for (const field of ["promptTokens", "completionTokens", "totalTokens"]) {
        const value = Number(usage[field]);
        numeric[field] = Number.isFinite(value) ? value : 0;
      }
      tokenUsage = JSON.stringify(numeric);
    }
    return this.db.yusuf_agent_runs.update({
      where: { id: Number(runId) },
      data: {
        // A model reference is provider/model identity only — never a key.
        modelRef: modelRef
          ? JSON.stringify({
              provider: String(modelRef.provider || "unknown"),
              model: String(modelRef.model || "unknown"),
            })
          : undefined,
        tokenUsage,
        estimatedCostMicros: estimatedCostMicros ?? undefined,
      },
    });
  }

  /**
   * Phase R: persists a ModelRouter completion envelope onto the AgentRun.
   * This is the one call site every routed model completion must go
   * through — extends the existing modelRef/tokenUsage/estimatedCostMicros
   * columns rather than forking a parallel run record. `estimatedCostMicros`
   * is left `null` (never coerced to 0) whenever cost confidence is
   * UNAVAILABLE — cost is informational only and is never read by
   * Policy/Approval.
   */
  async recordModelCompletion({ runId, routed }) {
    if (!routed) return null;
    const usageConfidence = routed.usage?.confidence || CONFIDENCE_UNAVAILABLE;
    const costConfidence = routed.cost?.confidence || CONFIDENCE_UNAVAILABLE;
    const usage =
      usageConfidence === CONFIDENCE_UNAVAILABLE
        ? undefined
        : {
            promptTokens: routed.usage.promptTokens,
            completionTokens: routed.usage.completionTokens,
            totalTokens: routed.usage.totalTokens,
          };
    let tokenUsage;
    if (usage) {
      tokenUsage = JSON.stringify({ ...usage, confidence: usageConfidence });
    } else {
      tokenUsage = JSON.stringify({ confidence: usageConfidence });
    }
    const estimatedCostMicros =
      costConfidence === CONFIDENCE_UNAVAILABLE ||
      routed.cost?.amountMicros == null
        ? null
        : Number(routed.cost.amountMicros);
    const updated = await this.db.yusuf_agent_runs.update({
      where: { id: Number(runId) },
      data: {
        modelRef: JSON.stringify({
          telemetryKind: "ROUTED_COMPLETION",
          provider: String(routed.provider || "unknown").slice(0, 80),
          model: String(routed.model || "unknown").slice(0, 200),
          requestedModel: routed.requestedModel
            ? String(routed.requestedModel).slice(0, 200)
            : null,
          modelMismatch: Boolean(routed.modelMismatch),
          policy: routed.policy || null,
          fallbackOccurred: Boolean(routed.fallbackOccurred),
          latencyMs: Number.isFinite(routed.latencyMs)
            ? routed.latencyMs
            : null,
          usageConfidence,
          costConfidence,
        }),
        tokenUsage,
        estimatedCostMicros,
      },
    });
    await this.audit.append({
      eventType: "agent.model.completed",
      principal: { type: PRINCIPAL_TYPES.SYSTEM, id: "model-router" },
      taskRef: updated.taskId,
      runRef: updated.id,
      outcome: "COMPLETED",
      metadata: {
        provider: String(routed.provider || "unknown").slice(0, 80),
        model: String(routed.model || "unknown").slice(0, 200),
        requestedModel: routed.requestedModel
          ? String(routed.requestedModel).slice(0, 200)
          : null,
        modelMismatch: Boolean(routed.modelMismatch),
        policy: routed.policy || null,
        fallbackOccurred: Boolean(routed.fallbackOccurred),
        latencyMs: Number.isFinite(routed.latencyMs) ? routed.latencyMs : null,
        usageConfidence,
        promptUnits: usage?.promptTokens ?? null,
        completionUnits: usage?.completionTokens ?? null,
        totalUnits: usage?.totalTokens ?? null,
        costConfidence,
        amountMicros: estimatedCostMicros,
      },
      requestId: updated.requestId,
    });
    return updated;
  }

  activeRunsFor(agentId) {
    return this.db.yusuf_agent_runs.findMany({
      where: {
        agentId: Number(agentId),
        status: {
          in: [
            RUN_STATUSES.QUEUED,
            RUN_STATUSES.RUNNING,
            RUN_STATUSES.WAITING_TOOL,
            RUN_STATUSES.WAITING_APPROVAL,
            RUN_STATUSES.WAITING_HANDOFF,
          ],
        },
      },
      orderBy: { createdAt: "asc" },
    });
  }
}

module.exports = { AgentRunCoordinator };
