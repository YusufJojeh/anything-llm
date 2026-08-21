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
  }) {
    const idempotencyKey = canonicalHash({
      taskId: Number(taskId),
      agentId: Number(agentId),
      runKind,
      attempt: Number(attempt),
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
            status: RUN_STATUSES.QUEUED,
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
          outcome: RUN_STATUSES.QUEUED,
          metadata: { runKind, attempt, runId: created.uuid },
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
    const active = await this.db.yusuf_agent_runs.count({
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
      delegate: this.db.yusuf_agent_runs,
      id: run.id,
      version: run.version,
      from: RUN_STATUSES.QUEUED,
      to: RUN_STATUSES.RUNNING,
      machine: "run",
      data: { startedAt: new Date() },
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
    return this.db.yusuf_agent_runs.update({
      where: { id: Number(runId) },
      data: {
        modelRef: JSON.stringify({
          telemetryKind: "ROUTED_COMPLETION",
          provider: String(routed.provider || "unknown"),
          model: String(routed.model || "unknown"),
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
