import { TONES, toneFor, TONE_SEVERITY } from "./statusSemantics";

/**
 * Turns the Gate F `/dashboard` projection plus the agent roster into the view
 * model the Command Center renders.
 *
 * Rules this module exists to enforce:
 *
 * - Nothing is invented. Every field traces to a value the backend asserted.
 *   Where the backend says nothing, the model says `null`, not a guess.
 * - A real zero (`0 approvals`) and an unknown (`not loaded yet`) are
 *   different values, and the caller can always tell them apart.
 * - An edge referencing an agent the roster does not contain is dropped, not
 *   rendered against a fabricated node.
 */

export const CORE_STATES = Object.freeze({
  EMERGENCY_STOP: "EMERGENCY_STOP",
  SECURITY_ALERT: "SECURITY_ALERT",
  WAITING_APPROVAL: "WAITING_APPROVAL",
  BLOCKED: "BLOCKED",
  RECONCILING: "RECONCILING",
  OFFLINE_ADAPTER: "OFFLINE_ADAPTER",
  DEGRADED: "DEGRADED",
  WORKING: "WORKING",
  HEALTHY: "HEALTHY",
});

const CORE_STATE_TONE = Object.freeze({
  [CORE_STATES.EMERGENCY_STOP]: TONES.BLOCKED,
  [CORE_STATES.SECURITY_ALERT]: TONES.ERROR,
  [CORE_STATES.WAITING_APPROVAL]: TONES.APPROVAL,
  [CORE_STATES.BLOCKED]: TONES.BLOCKED,
  [CORE_STATES.RECONCILING]: TONES.WARNING,
  [CORE_STATES.OFFLINE_ADAPTER]: TONES.OFFLINE,
  [CORE_STATES.DEGRADED]: TONES.WARNING,
  [CORE_STATES.WORKING]: TONES.ACTIVE,
  [CORE_STATES.HEALTHY]: TONES.HEALTHY,
});

const BLOCKED_TASK_STATUSES = new Set(["BLOCKED", "FAILED"]);
const BUSY_AGENT_STATUSES = new Set(["RUNNING", "WAITING", "BLOCKED"]);

export function coreStateTone(coreState) {
  return CORE_STATE_TONE[coreState] || TONES.UNKNOWN;
}

/**
 * Merges the roster (identity) with the dashboard's `agentStatuses`
 * (live state). An agent present in one but not the other still renders: the
 * roster is identity of record, and a status without a roster entry is shown
 * as an unknown-identity node rather than dropped silently.
 */
export function buildAgents(dashboard, roster) {
  const identities = new Map(
    (roster?.agents || []).map((agent) => [agent.agentId, agent])
  );
  const statuses = new Map(
    (dashboard?.agentStatuses || []).map((status) => [status.agentId, status])
  );
  const ids = [...new Set([...identities.keys(), ...statuses.keys()])];

  return ids.map((agentId) => {
    const identity = identities.get(agentId) || null;
    const status = statuses.get(agentId) || null;
    return {
      agentId,
      name: identity?.name || agentId,
      mission: identity?.mission || null,
      // No status row means the dashboard did not assert one. That is not
      // "IDLE" — it is unknown, and it renders as unknown.
      status: status?.status || null,
      tone: status ? toneFor("agent", status.status) : TONES.UNKNOWN,
      activeTaskId: status?.activeTaskId || null,
      currentRunId: status?.currentRunId || null,
      capabilityCount: identity ? identity.capabilityCount : null,
      capabilityKeys: identity?.capabilityKeys || [],
      lifecycleStatus: identity?.lifecycleStatus || null,
      hasIdentity: identity !== null,
    };
  });
}

/**
 * Real relationship edges only.
 *
 * The sole source is `activeHandoffs`, which the backend derives from the
 * durable `yusuf_handoffs` table. There is no decorative edge generation here
 * and no "related agents" heuristic — if two agents have no persisted
 * relationship, no line is drawn between them.
 */
/**
 * Classifies an edge from the handoff reason the backend actually stored.
 *
 * `gate` is `yusuf_handoffs.reason` — a server-owned value like
 * `DELEGATED_FOR_IMPLEMENTATION` or `REQUESTED_REVIEW`. Reading a category out
 * of it lets delegation and review look different without inventing anything;
 * an unrecognised reason stays `HANDOFF` rather than being forced into a bucket.
 */
export function edgeKind(gate) {
  const value = String(gate || "").toUpperCase();
  if (value.includes("REVIEW")) return "REVIEW";
  if (value.includes("DELEG")) return "DELEGATION";
  if (value.includes("ESCALAT")) return "ESCALATION";
  if (value.includes("DEPEND")) return "DEPENDENCY";
  return "HANDOFF";
}

export function buildEdges(dashboard, agents) {
  const known = new Set(agents.map((agent) => agent.agentId));
  return (dashboard?.activeHandoffs || [])
    .filter(
      (handoff) =>
        known.has(handoff.fromAgentId) && known.has(handoff.toAgentId)
    )
    .map((handoff) => ({
      id: `${handoff.fromAgentId}->${handoff.toAgentId}:${handoff.taskId}`,
      fromAgentId: handoff.fromAgentId,
      toAgentId: handoff.toAgentId,
      taskId: handoff.taskId,
      gate: handoff.gate,
      kind: edgeKind(handoff.gate),
      status: handoff.status || null,
      tone: toneFor("handoff", handoff.status),
      // Motion is only permitted on an edge the backend says is live.
      active: handoff.status === "ACCEPTED",
    }));
}

/**
 * Edges the constellation could not draw because one endpoint is not in the
 * roster. Surfaced rather than swallowed so a stale or renamed agent shows up
 * as a real inconsistency instead of a silently missing line.
 */
export function orphanedEdges(dashboard, agents) {
  const known = new Set(agents.map((agent) => agent.agentId));
  return (dashboard?.activeHandoffs || []).filter(
    (handoff) =>
      !known.has(handoff.fromAgentId) || !known.has(handoff.toAgentId)
  );
}

function auditStatusOf(dashboard) {
  return dashboard?.auditSummary?.chainStatus || "UNCHECKED";
}

/**
 * The central core's semantic state, in strict precedence order. Security
 * conditions outrank activity: a system that is doing useful work while its
 * audit chain is broken is not "working", it is in a security alert.
 */
export function deriveCoreState(dashboard) {
  if (!dashboard) return null;
  const audit = auditStatusOf(dashboard);
  const blockedTasks = (dashboard.taskStatuses || []).filter((task) =>
    BLOCKED_TASK_STATUSES.has(task.status)
  );
  const offlineAdapters = (dashboard.adapterHealth || []).filter(
    (adapter) => adapter.status !== "AVAILABLE"
  );
  const approvals = dashboard.approvalAttentionQueue || [];
  const reconciliation = dashboard.systemStatus?.pendingReconciliation || 0;

  if (dashboard.systemStatus?.emergencyStop) return CORE_STATES.EMERGENCY_STOP;
  if (audit === "BROKEN" || audit === "INVALID")
    return CORE_STATES.SECURITY_ALERT;
  if (approvals.length > 0) return CORE_STATES.WAITING_APPROVAL;
  if (blockedTasks.length > 0) return CORE_STATES.BLOCKED;
  if (reconciliation > 0) return CORE_STATES.RECONCILING;
  if (offlineAdapters.length > 0) return CORE_STATES.OFFLINE_ADAPTER;
  if (dashboard.systemStatus?.controlPlane !== "HEALTHY")
    return CORE_STATES.DEGRADED;
  if ((dashboard.agentStatuses || []).some((a) => a.status === "RUNNING"))
    return CORE_STATES.WORKING;
  return CORE_STATES.HEALTHY;
}

/**
 * The counts the core and System Health surfaces display.
 *
 * `agentsReporting` is separate from `agentsTotal` on purpose: "3 / 3 agents
 * reporting" is a claim about how many agents actually returned a status, not
 * a claim that all of them are healthy.
 */
export function buildSummary(dashboard, agents) {
  if (!dashboard) return null;
  const tasks = dashboard.taskStatuses || [];
  return {
    asOf: dashboard.asOf || null,
    agentsTotal: agents.length,
    agentsReporting: agents.filter((agent) => agent.status !== null).length,
    agentsBusy: agents.filter((agent) => BUSY_AGENT_STATUSES.has(agent.status))
      .length,
    pendingApprovals: (dashboard.approvalAttentionQueue || []).length,
    blockedTasks: tasks.filter((task) => BLOCKED_TASK_STATUSES.has(task.status))
      .length,
    waitingApprovalTasks: tasks.filter(
      (task) => task.status === "WAITING_APPROVAL"
    ).length,
    activeTasks: tasks.filter((task) => task.status === "RUNNING").length,
    totalTasksInWindow: tasks.length,
    activeRuns: (dashboard.runProgress || []).length,
    activeHandoffs: (dashboard.activeHandoffs || []).length,
    pendingReconciliation:
      dashboard.systemStatus?.pendingReconciliation ?? null,
    emergencyStop: dashboard.systemStatus?.emergencyStop ?? null,
    controlPlane: dashboard.systemStatus?.controlPlane || null,
    auditStatus: auditStatusOf(dashboard),
    auditLastSequence: dashboard.auditSummary?.lastSequence ?? null,
    auditLastCheckedAt: dashboard.auditSummary?.lastCheckedAt || null,
    auditVerifiedThrough:
      dashboard.auditSummary?.verifiedThroughSequence ?? null,
    adaptersTotal: (dashboard.adapterHealth || []).length,
    adaptersAvailable: (dashboard.adapterHealth || []).filter(
      (adapter) => adapter.status === "AVAILABLE"
    ).length,
    // Reported, not estimated. Zero here means runs recorded zero cost.
    costTodayMicros: dashboard.costSummary?.todayMicros ?? null,
    costMonthMicros: dashboard.costSummary?.monthMicros ?? null,
    costCurrency: dashboard.costSummary?.currency || null,
  };
}

/**
 * The "needs Yusuf" queue.
 *
 * Ordered by how much it blocks Yusuf, not by recency: approvals and blocked
 * work first, ambient warnings last. Every entry links to a real surface —
 * there are no advisory items with nowhere to go.
 */
export function buildAttentionQueue(dashboard) {
  if (!dashboard) return null;
  const items = [];

  if (dashboard.systemStatus?.emergencyStop)
    items.push({
      id: "system:emergency-stop",
      kind: "EMERGENCY_STOP",
      tone: TONES.BLOCKED,
      href: "/os/system",
      values: {},
    });

  const audit = auditStatusOf(dashboard);
  if (audit === "BROKEN" || audit === "INVALID")
    items.push({
      id: "audit:broken",
      kind: "AUDIT_BROKEN",
      tone: TONES.ERROR,
      href: "/os/system",
      values: { status: audit },
    });

  for (const approval of dashboard.approvalAttentionQueue || [])
    items.push({
      id: `approval:${approval.approvalId}`,
      kind: "APPROVAL_PENDING",
      tone: TONES.APPROVAL,
      href: `/os/approvals/${approval.approvalId}`,
      values: {
        capabilityKey: approval.capabilityKey,
        riskLevel: approval.riskLevel,
        targetSummary: approval.targetSummary,
        expiresAt: approval.expiresAt,
      },
    });

  for (const task of dashboard.taskStatuses || []) {
    if (!BLOCKED_TASK_STATUSES.has(task.status)) continue;
    items.push({
      id: `task:${task.taskId}`,
      kind: task.status === "FAILED" ? "TASK_FAILED" : "TASK_BLOCKED",
      tone: task.status === "FAILED" ? TONES.ERROR : TONES.BLOCKED,
      href: `/os/tasks/${task.taskId}`,
      values: {
        taskId: task.taskId,
        blockingReason: task.blockingReason || null,
      },
    });
  }

  const reconciliation = dashboard.systemStatus?.pendingReconciliation || 0;
  if (reconciliation > 0)
    items.push({
      id: "system:reconciliation",
      kind: "RECONCILIATION_PENDING",
      tone: TONES.WARNING,
      href: "/os/system",
      values: { count: reconciliation },
    });

  for (const adapter of dashboard.adapterHealth || []) {
    if (adapter.status === "AVAILABLE") continue;
    items.push({
      id: `adapter:${adapter.adapterId}`,
      kind: "ADAPTER_OFFLINE",
      tone: TONES.OFFLINE,
      href: "/os/system",
      values: { adapterId: adapter.adapterId, status: adapter.status },
    });
  }

  if (audit === "STALE")
    items.push({
      id: "audit:stale",
      kind: "AUDIT_STALE",
      tone: TONES.WARNING,
      href: "/os/system",
      values: {
        verifiedThrough:
          dashboard.auditSummary?.verifiedThroughSequence ?? null,
        lastSequence: dashboard.auditSummary?.lastSequence ?? null,
      },
    });

  return items.sort(
    (left, right) => TONE_SEVERITY[left.tone] - TONE_SEVERITY[right.tone]
  );
}

/** One call for the whole Command Center view model. */
export function buildCommandCenter({ dashboard, roster }) {
  const agents = buildAgents(dashboard, roster);
  return {
    agents,
    edges: buildEdges(dashboard, agents),
    orphanedEdges: orphanedEdges(dashboard, agents),
    coreState: deriveCoreState(dashboard),
    summary: buildSummary(dashboard, agents),
    attention: buildAttentionQueue(dashboard),
  };
}
