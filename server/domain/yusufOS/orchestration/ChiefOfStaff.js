const prisma = require("../../../utils/prisma");
const {
  TASK_STATUSES,
  RUN_STATUSES,
  RUN_KINDS,
  RUN_FAILURE_KINDS,
  AGENT_KEYS,
  APPROVAL_STATUSES,
  PRINCIPAL_TYPES,
  REVIEW_VERDICTS,
} = require("../constants");
const { AgentRunCoordinator } = require("../agents/AgentRunCoordinator");
const { HandoffService } = require("../handoffs/HandoffService");
const { ReviewService } = require("../review/ReviewService");
const { CompletionPolicy } = require("./CompletionPolicy");
const { getAgentByKey } = require("../agents/AgentRegistry");
const { AuditService } = require("../audit/AuditService");
const { conditionalTransition } = require("../state/transitions");
const { YusufOSError, ErrorCodes } = require("../errors/YusufOSError");

/**
 * Deterministic orchestration layer.
 *
 * The Chief of Staff coordinates; it does not implement, review, or approve.
 * It holds no mutation capability at all (see agents/definitions.js), so
 * "the delegator inherits the delegatee's authority" is structurally
 * impossible rather than merely discouraged.
 *
 * A model may help *plan*; every state transition below is owned by this
 * server code and reads persisted state, never Agent prose.
 */
class ChiefOfStaff {
  constructor(db = prisma) {
    this.db = db;
    this.runs = new AgentRunCoordinator(db);
    this.handoffs = new HandoffService(db);
    this.reviews = new ReviewService(db);
    this.completion = new CompletionPolicy(db);
    this.audit = new AuditService(db);
  }

  async #requireAgent(key) {
    const agent = await getAgentByKey(key, this.db);
    if (!agent)
      throw new YusufOSError(
        ErrorCodes.NOT_FOUND,
        `Agent ${key} is not registered. Seed the core staff first.`,
        { status: 404 }
      );
    return agent;
  }

  /**
   * Delegates a task to a specialist role: assigns the Agent, records the
   * delegation edge, and queues an implementation run. Idempotent — repeated
   * delivery returns the same run rather than duplicating work.
   */
  async delegate({ taskId, toAgentKey, reason, requestId, attempt = 1 }) {
    const task = await this.db.yusuf_tasks.findUnique({
      where: { id: Number(taskId) },
    });
    if (!task)
      throw new YusufOSError(ErrorCodes.NOT_FOUND, "Task not found.", {
        status: 404,
      });

    const chief = await this.#requireAgent(AGENT_KEYS.CHIEF_OF_STAFF);
    const target = await this.#requireAgent(toAgentKey);

    await this.db.yusuf_tasks.updateMany({
      where: { id: task.id },
      data: { assignedAgentId: target.id },
    });

    const delegationReason = reason || "DELEGATED_FOR_IMPLEMENTATION";
    const handoff = await this.handoffs.create({
      taskId: task.id,
      fromAgentId: chief.id,
      toAgentId: target.id,
      reason: delegationReason,
      actingAgentId: chief.id,
      requestId,
    });

    const run = await this.runs.createRun({
      taskId: task.id,
      agentId: target.id,
      runKind:
        toAgentKey === AGENT_KEYS.REVIEWER
          ? RUN_KINDS.REVIEW
          : RUN_KINDS.IMPLEMENTATION,
      principal: { type: PRINCIPAL_TYPES.AGENT, id: chief.uuid },
      requestId,
      attempt,
    });

    await this.handoffs.accept({
      handoffId: handoff.id,
      acceptingAgentId: target.id,
      toRunId: run.id,
      requestId,
    });

    if (task.status === TASK_STATUSES.PLANNED)
      await conditionalTransition({
        delegate: this.db.yusuf_tasks,
        id: task.id,
        version: task.version,
        from: TASK_STATUSES.PLANNED,
        to: TASK_STATUSES.READY,
        machine: "task",
      });

    await this.audit.append({
      eventType: "task.delegated",
      principal: { type: PRINCIPAL_TYPES.AGENT, id: chief.uuid },
      taskRef: task.id,
      runRef: run.id,
      outcome: toAgentKey,
      metadata: { handoffId: handoff.uuid, reason: delegationReason },
      requestId,
    });
    return { handoff, run, agent: target };
  }

  /** Marks the task RUNNING once its first delegated run actually starts. */
  async markTaskRunning({ taskId }) {
    const task = await this.db.yusuf_tasks.findUnique({
      where: { id: Number(taskId) },
    });
    if (task.status !== TASK_STATUSES.READY) return task;
    await conditionalTransition({
      delegate: this.db.yusuf_tasks,
      id: task.id,
      version: task.version,
      from: TASK_STATUSES.READY,
      to: TASK_STATUSES.RUNNING,
      machine: "task",
    });
    return this.db.yusuf_tasks.findUnique({ where: { id: task.id } });
  }

  /**
   * Engineering finished its turn and wants review. Creates the Engineering ->
   * Reviewer edge and queues a Reviewer-owned run. The Engineering run moves
   * to WAITING_HANDOFF: it is done, but the task is not.
   */
  async requestReview({
    taskId,
    fromRunId,
    reason,
    artifacts = [],
    requestId,
    attempt = 1,
  }) {
    const fromRun = await this.db.yusuf_agent_runs.findUnique({
      where: { id: Number(fromRunId) },
      include: { agent: true },
    });
    if (!fromRun?.agent || fromRun.agent.key !== AGENT_KEYS.ENGINEERING)
      throw new YusufOSError(
        ErrorCodes.UNAUTHORIZED,
        "Only an Engineering run may request review.",
        { status: 403 }
      );
    const reviewer = await this.#requireAgent(AGENT_KEYS.REVIEWER);

    const handoff = await this.handoffs.create({
      taskId: Number(taskId),
      fromAgentId: fromRun.agentId,
      toAgentId: reviewer.id,
      fromRunId: fromRun.id,
      reason: reason || "IMPLEMENTATION_READY_FOR_REVIEW",
      artifacts,
      actingAgentId: fromRun.agentId,
      requestId,
    });

    // Current ownership of the task follows the handoff. Gate C's
    // IntentService requires the acting Agent to match the task's assigned
    // Agent, so the Reviewer must genuinely own the task while reviewing it —
    // the delegation *history* is preserved in yusuf_handoffs, not by pinning
    // assignedAgentId to whoever was first.
    await this.db.yusuf_tasks.updateMany({
      where: { id: Number(taskId) },
      data: { assignedAgentId: reviewer.id },
    });

    const reviewRun = await this.runs.createRun({
      taskId: Number(taskId),
      agentId: reviewer.id,
      runKind: RUN_KINDS.REVIEW,
      principal: { type: PRINCIPAL_TYPES.AGENT, id: fromRun.agent.uuid },
      requestId,
      attempt,
    });

    await this.handoffs.accept({
      handoffId: handoff.id,
      acceptingAgentId: reviewer.id,
      toRunId: reviewRun.id,
      requestId,
    });

    if (fromRun.status === RUN_STATUSES.RUNNING)
      await this.runs.transition({
        runId: fromRun.id,
        to: RUN_STATUSES.WAITING_HANDOFF,
        requestId,
        eventType: "agent.run.waiting_handoff",
      });

    return { handoff, reviewRun };
  }

  /**
   * Records a Reviewer's verdict and closes out that review turn.
   *
   * Layering matters here: ReviewService owns *verdict authority* (only a
   * reviewer-owned run may produce one), while this method owns *lifecycle* —
   * finishing the run and its handoff. Without the lifecycle half, a Reviewer
   * would sit at its concurrency limit forever after its first review.
   */
  async submitReview({
    reviewRunId,
    targetRunId = null,
    rawVerdict,
    requestId,
  }) {
    const verdict = await this.reviews.submitVerdict({
      reviewRunId,
      targetRunId,
      rawVerdict,
      requestId,
    });

    const reviewRun = await this.db.yusuf_agent_runs.findUnique({
      where: { id: Number(reviewRunId) },
    });
    if (reviewRun.status === RUN_STATUSES.RUNNING)
      await this.runs.transition({
        runId: reviewRun.id,
        to: RUN_STATUSES.COMPLETED,
        data: { completedAt: new Date() },
        requestId,
        eventType: "agent.run.completed",
      });

    const handoff = await this.db.yusuf_handoffs.findFirst({
      where: { toRunId: reviewRun.id, status: "ACCEPTED" },
    });
    if (handoff)
      await this.handoffs.complete({ handoffId: handoff.id, requestId });

    return verdict;
  }

  /**
   * Surfaces what is waiting on Yusuf. Chief of Staff reports approvals; it
   * never resolves them — auto-approving a delegated task would defeat the
   * entire point of durable approval.
   */
  async pendingApprovals(taskId) {
    return this.db.yusuf_approval_requests.findMany({
      where: {
        status: APPROVAL_STATUSES.PENDING,
        intent: { taskId: Number(taskId) },
      },
      include: { intent: true },
      orderBy: { requestedAt: "asc" },
    });
  }

  /**
   * The observable projection a future Command Center renders: real agents,
   * real edges, real status. Every field is read from persisted state.
   */
  async taskState(taskId) {
    const numericTaskId = Number(taskId);
    const actions = await this.db.yusuf_action_intents.findMany({
      where: { taskId: numericTaskId },
      include: { receipt: true, approval: true },
      orderBy: { createdAt: "asc" },
    });
    const resourceIds = (type) =>
      actions
        .filter((intent) => intent.resourceType === type)
        .map((intent) => intent.resourceId);
    const [
      task,
      runs,
      handoffs,
      verdicts,
      approvals,
      completion,
      research,
      career,
      inbox,
    ] = await Promise.all([
      this.db.yusuf_tasks.findUnique({
        where: { id: numericTaskId },
        include: { assignedAgent: true },
      }),
      this.db.yusuf_agent_runs.findMany({
        where: { taskId: numericTaskId },
        include: { agent: true },
        orderBy: { createdAt: "asc" },
      }),
      this.handoffs.listForTask(numericTaskId),
      this.reviews.history(numericTaskId),
      this.pendingApprovals(numericTaskId),
      this.completion.evaluate(numericTaskId),
      this.db.yusuf_research_items.findMany({
        where: { uuid: { in: resourceIds("RESEARCH_ITEM") } },
        select: { uuid: true, status: true, category: true },
        orderBy: { createdAt: "asc" },
      }),
      this.db.yusuf_career_opportunities.findMany({
        where: { uuid: { in: resourceIds("CAREER_OPPORTUNITY") } },
        select: { uuid: true, status: true },
        orderBy: { createdAt: "asc" },
      }),
      this.db.yusuf_inbox_messages.findMany({
        where: { uuid: { in: resourceIds("INBOX_MESSAGE") } },
        select: {
          uuid: true,
          status: true,
          classification: true,
          linkedCareerOpportunityUuid: true,
        },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    return {
      task: task
        ? {
            uuid: task.uuid,
            title: task.title,
            status: task.status,
            blockedReason: task.blockedReason,
            assignedAgent: task.assignedAgent?.key || null,
          }
        : null,
      agents: runs.map((run) => ({
        agent: run.agent?.key || null,
        runUuid: run.uuid,
        runKind: run.runKind,
        status: run.status,
        failureKind: run.failureKind,
      })),
      handoffs: handoffs.map((h) => ({
        uuid: h.uuid,
        reason: h.reason,
        status: h.status,
        fromAgentId: h.fromAgentId,
        toAgentId: h.toAgentId,
      })),
      reviewHistory: verdicts.map((v) => ({
        uuid: v.uuid,
        verdict: v.verdict,
        createdAt: v.createdAt,
      })),
      waitingApprovals: approvals.length,
      workProducts: {
        research: research.map((row) => ({
          uuid: row.uuid,
          status: row.status,
          category: row.category,
        })),
        career: career.map((row) => ({ uuid: row.uuid, status: row.status })),
        inbox: inbox.map((row) => ({
          uuid: row.uuid,
          status: row.status,
          classification: row.classification,
          linked: row.linkedCareerOpportunityUuid !== null,
        })),
        actions: actions.map((intent) => ({
          uuid: intent.uuid,
          capability: intent.capabilityKey,
          status: intent.status,
          approvalStatus: intent.approval?.status || null,
          receiptOutcome: intent.receipt?.outcome || null,
          verificationStatus: intent.receipt?.verificationStatus || null,
        })),
      },
      completion,
    };
  }

  /**
   * The only path to COMPLETED. Consults CompletionPolicy (persisted state
   * only) and refuses otherwise — an Agent claiming completion cannot move
   * this. A BLOCK verdict lands the task in BLOCKED with a reason instead.
   */
  async evaluateCompletion({ taskId, requestId }) {
    const task = await this.db.yusuf_tasks.findUnique({
      where: { id: Number(taskId) },
    });
    if (!task)
      throw new YusufOSError(ErrorCodes.NOT_FOUND, "Task not found.", {
        status: 404,
      });

    const assessment = await this.completion.evaluate(task.id);

    if (assessment.complete) {
      if (task.status !== TASK_STATUSES.RUNNING)
        return { applied: false, assessment, status: task.status };
      await conditionalTransition({
        delegate: this.db.yusuf_tasks,
        id: task.id,
        version: task.version,
        from: TASK_STATUSES.RUNNING,
        to: TASK_STATUSES.COMPLETED,
        machine: "task",
        data: { blockedReason: null },
      });
      await this.audit.append({
        eventType: "task.completed",
        principal: { type: PRINCIPAL_TYPES.SYSTEM, id: "completion-policy" },
        taskRef: task.id,
        outcome: TASK_STATUSES.COMPLETED,
        metadata: {
          reviewVerdict: assessment.reviewVerdict,
          warningCount: assessment.warnings.length,
        },
        requestId,
      });
      return { applied: true, assessment, status: TASK_STATUSES.COMPLETED };
    }

    if (
      assessment.reviewVerdict === REVIEW_VERDICTS.BLOCK &&
      task.status === TASK_STATUSES.RUNNING
    ) {
      await conditionalTransition({
        delegate: this.db.yusuf_tasks,
        id: task.id,
        version: task.version,
        from: TASK_STATUSES.RUNNING,
        to: TASK_STATUSES.BLOCKED,
        machine: "task",
        data: { blockedReason: assessment.blockers.join(",") },
      });
      await this.audit.append({
        eventType: "task.blocked",
        principal: { type: PRINCIPAL_TYPES.SYSTEM, id: "completion-policy" },
        taskRef: task.id,
        outcome: TASK_STATUSES.BLOCKED,
        metadata: { blockers: assessment.blockers },
        requestId,
      });
      return { applied: true, assessment, status: TASK_STATUSES.BLOCKED };
    }

    return { applied: false, assessment, status: task.status };
  }

  /**
   * Reviewer returned BLOCK: send the task back to Engineering for rework.
   * Creates a *new* Engineering run (higher attempt) and a Reviewer ->
   * Engineering edge. Prior review verdicts are never touched.
   */
  async requestRework({ taskId, reason, requestId, attempt }) {
    const task = await this.db.yusuf_tasks.findUnique({
      where: { id: Number(taskId) },
    });
    const reviewer = await this.#requireAgent(AGENT_KEYS.REVIEWER);
    const engineering = await this.#requireAgent(AGENT_KEYS.ENGINEERING);

    const handoff = await this.handoffs.create({
      taskId: task.id,
      fromAgentId: reviewer.id,
      toAgentId: engineering.id,
      reason: reason || "REVIEW_BLOCKED_REWORK_REQUIRED",
      actingAgentId: reviewer.id,
      requestId,
    });

    // Ownership returns to Engineering for the rework turn.
    await this.db.yusuf_tasks.updateMany({
      where: { id: task.id },
      data: { assignedAgentId: engineering.id },
    });

    const run = await this.runs.createRun({
      taskId: task.id,
      agentId: engineering.id,
      runKind: RUN_KINDS.IMPLEMENTATION,
      principal: { type: PRINCIPAL_TYPES.AGENT, id: reviewer.uuid },
      requestId,
      attempt,
    });

    await this.handoffs.accept({
      handoffId: handoff.id,
      acceptingAgentId: engineering.id,
      toRunId: run.id,
      requestId,
    });

    if (task.status === TASK_STATUSES.BLOCKED)
      await conditionalTransition({
        delegate: this.db.yusuf_tasks,
        id: task.id,
        version: task.version,
        from: TASK_STATUSES.BLOCKED,
        to: TASK_STATUSES.READY,
        machine: "task",
        data: { blockedReason: null },
      });

    return { handoff, run };
  }

  /** Records an operator-visible blocker without collapsing it into FAILED. */
  async recordBlocker({ runId, failureKind, detail, requestId }) {
    if (!Object.values(RUN_FAILURE_KINDS).includes(failureKind))
      throw new YusufOSError(
        ErrorCodes.VALIDATION_ERROR,
        `Unknown failure kind: ${failureKind}`,
        { status: 422 }
      );
    return this.runs.transition({
      runId,
      to: RUN_STATUSES.BLOCKED,
      data: { failureKind, blockedReason: String(detail).slice(0, 1000) },
      requestId,
      eventType: "agent.run.blocked",
    });
  }
}

module.exports = { ChiefOfStaff };
