const prisma = require("../../../utils/prisma");
const {
  RUN_STATUSES,
  APPROVAL_STATUSES,
  INTENT_STATUSES,
  SECURITY_SETTING_KEYS,
} = require("../constants");
const { CompletionPolicy } = require("../orchestration/CompletionPolicy");
const { getCapability } = require("../capabilities/registry");
const { redactString } = require("../security/redaction");
const { auditKeyConfigured } = require("../audit/AuditService");
const { LocalGitAdapter } = require("../adapters/localGit/LocalGitAdapter");
const { ProjectAdapter } = require("../adapters/project/ProjectAdapter");
const { BrowserAdapter } = require("../adapters/browser/BrowserAdapter");

const PROJECTION_VERSION = 1;
const DEFAULT_TASK_LIMIT = 50;
const ADAPTER_HEALTH_TTL_MS = 10000;

// Run states that mean the Agent is actively working versus parked waiting on
// something. Kept explicit so the projection's notion of "busy" cannot drift
// from the state machine's.
const ACTIVE_RUN_STATES = Object.freeze([
  RUN_STATUSES.RUNNING,
  RUN_STATUSES.WAITING_TOOL,
  RUN_STATUSES.VERIFYING,
]);
const WAITING_RUN_STATES = Object.freeze([
  RUN_STATUSES.WAITING_APPROVAL,
  RUN_STATUSES.WAITING_HANDOFF,
  RUN_STATUSES.WAITING_DEPENDENCY,
  RUN_STATUSES.QUEUED,
]);

// Adapter availability can spawn a real subprocess (`git --version`), so it is
// cached briefly. A dashboard poll must not fork a process every second.
let adapterHealthCache = { at: 0, value: null };

// Chain verification walks every audit event, so it is never run implicitly by
// a dashboard read. `POST /audit-integrity/check` performs the real walk and
// records the result here; until then the honest answer is UNCHECKED.
let auditCheckCache = null;

function recordAuditCheck(result, verifiedThroughSequence = null) {
  auditCheckCache = {
    chainStatus: result.valid ? "VALID" : "BROKEN",
    reason: result.valid ? null : result.reason || null,
    lastCheckedAt: new Date().toISOString(),
    // Which chain tip this verdict actually covers. Without it, a VALID from
    // sequence 100 would keep describing a chain that has since grown (or been
    // tampered with) to 5000 — the projection would assert far more than was
    // ever proven.
    verifiedThroughSequence:
      verifiedThroughSequence === null
        ? result.count || 0
        : verifiedThroughSequence,
  };
  return auditCheckCache;
}

function resetProjectionCaches() {
  adapterHealthCache = { at: 0, value: null };
  auditCheckCache = null;
}

/**
 * Builds the normalized Command Center projection defined in
 * `docs/yusuf-os/gate-b/api-realtime-frontend.md` §4.
 *
 * Every field is derived from persisted, server-owned state. Nothing here
 * reads Agent prose, and nothing is synthesized to look busy: a value that
 * cannot be proven is reported as zero, null, or UNCHECKED rather than
 * estimated. That is the contract the future UI depends on — see
 * `docs/yusuf-os/memory/FRONTEND_VISION.md` ("no fake data").
 */
class DashboardProjection {
  constructor(db = prisma) {
    this.db = db;
    this.completion = new CompletionPolicy(db);
  }

  async build({ taskLimit = DEFAULT_TASK_LIMIT } = {}) {
    const [
      systemStatus,
      agentStatuses,
      taskRows,
      approvalAttentionQueue,
      activeHandoffs,
      adapterHealth,
      auditSummary,
      costSummary,
      eventCursor,
    ] = await Promise.all([
      this.#systemStatus(),
      this.#agentStatuses(),
      this.#recentTasks(taskLimit),
      this.#approvalQueue(),
      this.#activeHandoffs(),
      this.#adapterHealth(),
      this.#auditSummary(),
      this.#costSummary(),
      this.#eventCursor(),
    ]);

    const runProgress = await this.#runProgress(taskRows.map((t) => t.id));

    return {
      asOf: new Date().toISOString(),
      projectionVersion: PROJECTION_VERSION,
      eventCursor,
      systemStatus,
      agentStatuses,
      taskStatuses: taskRows.map((task) => ({
        taskId: task.uuid,
        status: task.status,
        priority: task.priority,
        blockingReason: task.blockedReason || undefined,
        updatedAt: task.updatedAt.toISOString(),
      })),
      approvalAttentionQueue,
      activeHandoffs,
      runProgress,
      adapterHealth,
      auditSummary,
      costSummary,
    };
  }

  async #systemStatus() {
    const [killSwitch, unresolved] = await Promise.all([
      this.db.yusuf_security_settings.findUnique({
        where: { key: SECURITY_SETTING_KEYS.EXTERNAL_MUTATIONS_DISABLED },
      }),
      // Every non-terminal execution state means a real effect may have
      // happened and has not been proven either way. Counting only UNKNOWN
      // would contradict CompletionPolicy, which already treats EXECUTING and
      // EXECUTED_UNVERIFIED as unverified external effects — and would report
      // a clean system after a crash between execution and verification.
      // Counted over intents so overlapping receipt states cannot double- or
      // under-count a single outstanding effect.
      this.db.yusuf_action_intents.count({
        where: {
          status: {
            in: [
              INTENT_STATUSES.EXECUTING,
              INTENT_STATUSES.EXECUTED_UNVERIFIED,
              INTENT_STATUSES.FAILED_UNKNOWN,
            ],
          },
        },
      }),
    ]);
    // Read routes perform no audit append, so reaching this code proves
    // nothing about the key. Ask the audit subsystem's own predicate instead
    // of duplicating a weaker `typeof` check that an empty or short key passes.
    return {
      controlPlane: auditKeyConfigured() ? "HEALTHY" : "DEGRADED",
      emergencyStop: killSwitch?.value === "true",
      pendingReconciliation: unresolved,
    };
  }

  async #agentStatuses() {
    const agents = await this.db.yusuf_agents.findMany({
      orderBy: { createdAt: "asc" },
    });
    const statuses = [];
    for (const agent of agents) {
      if (agent.status !== "ACTIVE") {
        statuses.push({ agentId: agent.key, status: "DISABLED" });
        continue;
      }
      const runs = await this.db.yusuf_agent_runs.findMany({
        where: {
          agentId: agent.id,
          status: {
            in: [
              ...ACTIVE_RUN_STATES,
              ...WAITING_RUN_STATES,
              RUN_STATUSES.BLOCKED,
            ],
          },
        },
        include: { task: { select: { uuid: true } } },
        orderBy: { updatedAt: "desc" },
      });
      const active = runs.find((r) => ACTIVE_RUN_STATES.includes(r.status));
      const blocked = runs.find((r) => r.status === RUN_STATUSES.BLOCKED);
      const waiting = runs.find((r) => WAITING_RUN_STATES.includes(r.status));
      const current = active || blocked || waiting || null;
      statuses.push({
        agentId: agent.key,
        status: active
          ? "RUNNING"
          : blocked
            ? "BLOCKED"
            : waiting
              ? "WAITING"
              : "IDLE",
        activeTaskId: current?.task?.uuid,
        currentRunId: current?.uuid,
      });
    }
    return statuses;
  }

  #recentTasks(limit) {
    return this.db.yusuf_tasks.findMany({
      orderBy: { updatedAt: "desc" },
      take: Math.min(Math.max(Number(limit) || DEFAULT_TASK_LIMIT, 1), 200),
    });
  }

  async #approvalQueue() {
    const approvals = await this.db.yusuf_approval_requests.findMany({
      where: { status: APPROVAL_STATUSES.PENDING },
      include: { intent: true },
      orderBy: { requestedAt: "asc" },
    });
    return approvals.map((approval) => {
      const intent = approval.intent;
      const capability = getCapability(intent.capabilityKey);
      return {
        approvalId: approval.uuid,
        intentId: intent.uuid,
        capabilityKey: intent.capabilityKey,
        riskLevel: approval.requiredRiskLevel,
        // Human-readable but built from persisted, already-redacted identity
        // fields — never from an Agent's description of what it is doing.
        targetSummary: redactString(
          `${capability?.description || intent.capabilityKey} → ${intent.resourceType}:${intent.resourceId}`
        ).slice(0, 300),
        expiresAt: approval.expiresAt.toISOString(),
      };
    });
  }

  async #activeHandoffs() {
    const handoffs = await this.db.yusuf_handoffs.findMany({
      where: { status: { in: ["PENDING", "ACCEPTED"] } },
      include: {
        task: { select: { uuid: true } },
        fromAgent: { select: { key: true } },
        toAgent: { select: { key: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    return handoffs.map((handoff) => ({
      fromAgentId: handoff.fromAgent.key,
      toAgentId: handoff.toAgent.key,
      taskId: handoff.task.uuid,
      // Agent-authored text: clamped and redacted on the way out to match
      // targetSummary's handling. The write path also constrains it, but a
      // projection should not be the first place that is enforced.
      gate: redactString(String(handoff.reason)).slice(0, 200),
      status: handoff.status,
    }));
  }

  async #runProgress(taskIds) {
    if (!taskIds.length) return [];
    const runs = await this.db.yusuf_agent_runs.findMany({
      where: {
        taskId: { in: taskIds },
        status: {
          notIn: [RUN_STATUSES.COMPLETED, RUN_STATUSES.CANCELLED],
        },
      },
      include: { task: { select: { uuid: true, id: true } } },
      orderBy: { createdAt: "asc" },
    });
    // One completion evaluation per task, reused across that task's runs —
    // the gate counts describe the task's progress, not a guessed per-run
    // percentage.
    const assessments = new Map();
    const progress = [];
    for (const run of runs) {
      if (!assessments.has(run.taskId))
        assessments.set(run.taskId, await this.completion.evaluate(run.taskId));
      const assessment = assessments.get(run.taskId);
      progress.push({
        runId: run.uuid,
        taskId: run.task.uuid,
        state: run.status,
        completedGates: assessment.gates.satisfied,
        totalGates: assessment.gates.total,
      });
    }
    return progress;
  }

  async #adapterHealth() {
    const now = Date.now();
    if (
      adapterHealthCache.value &&
      now - adapterHealthCache.at < ADAPTER_HEALTH_TTL_MS
    )
      return adapterHealthCache.value;
    const adapters = [
      new LocalGitAdapter({ db: this.db }),
      new ProjectAdapter({ db: this.db }),
      // Reports UNAVAILABLE until the operator opts the broker in, which is the
      // honest answer rather than omitting it from System Health entirely.
      new BrowserAdapter(),
    ];
    const value = [];
    for (const adapter of adapters) {
      const descriptor = adapter.descriptor();
      let status = "UNAVAILABLE";
      try {
        status = (await adapter.availability())?.status || "UNAVAILABLE";
      } catch {
        status = "UNAVAILABLE";
      }
      value.push({
        adapterId: descriptor.id,
        kind: descriptor.kind,
        status,
        capabilityCount: descriptor.capabilities.length,
      });
    }
    adapterHealthCache = { at: now, value };
    return value;
  }

  async #auditSummary() {
    const checkpoint = await this.db.yusuf_audit_checkpoints.findUnique({
      where: { key: "PRIMARY" },
    });
    const lastSequence = checkpoint?.lastSequence || 0;
    let chainStatus = auditCheckCache?.chainStatus || "UNCHECKED";
    // A verdict only describes the chain it walked. If the chain has grown (or
    // been rewritten) since, say so rather than keeping a green light lit.
    if (
      auditCheckCache &&
      auditCheckCache.verifiedThroughSequence !== lastSequence
    )
      chainStatus = "STALE";
    return {
      chainStatus,
      lastSequence,
      lastCheckedAt: auditCheckCache?.lastCheckedAt,
      verifiedThroughSequence: auditCheckCache?.verifiedThroughSequence,
      ...(auditCheckCache?.reason ? { reason: auditCheckCache.reason } : {}),
    };
  }

  async #costSummary() {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(startOfDay);
    startOfMonth.setDate(1);
    const [today, month] = await Promise.all([
      this.db.yusuf_agent_runs.aggregate({
        _sum: { estimatedCostMicros: true },
        where: { createdAt: { gte: startOfDay } },
      }),
      this.db.yusuf_agent_runs.aggregate({
        _sum: { estimatedCostMicros: true },
        where: { createdAt: { gte: startOfMonth } },
      }),
    ]);
    return {
      // Reports only what runs actually recorded. No provider is wired yet, so
      // this is legitimately zero rather than an estimate.
      todayMicros: today._sum.estimatedCostMicros || 0,
      monthMicros: month._sum.estimatedCostMicros || 0,
      currency: "USD",
    };
  }

  async #eventCursor() {
    const checkpoint = await this.db.yusuf_audit_checkpoints.findUnique({
      where: { key: "PRIMARY" },
    });
    return String(checkpoint?.lastSequence || 0);
  }
}

module.exports = {
  DashboardProjection,
  PROJECTION_VERSION,
  recordAuditCheck,
  resetProjectionCaches,
};
