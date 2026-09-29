/**
 * View models for the Jarvis console surfaces around the System Core.
 *
 * Same rules as `commandCenterModel.js`: every value traces to a projection
 * field; missing data is `null` and renders as UNAVAILABLE / NOT REPORTED; a
 * real zero stays zero. Nothing here invents a percentage — the only progress
 * figure is `completedGates / totalGates`, which the backend reports per run.
 */

export const NA = Object.freeze({
  UNAVAILABLE: "UNAVAILABLE",
  NOT_REPORTED: "NOT_REPORTED",
  LOADING: "LOADING",
});

function finite(value) {
  return Number.isFinite(value) ? value : null;
}

/** Sum of reported counts; null (unknown) when there is nothing reported. */
function sum(values) {
  if (!values || typeof values !== "object") return null;
  const list = Object.values(values);
  if (list.some((value) => !Number.isFinite(value))) return null;
  return list.reduce((total, value) => total + value, 0);
}

/** agentId → { name, jobs } from the runtime organisation projection. */
export function departmentIndex(runtime) {
  const index = new Map();
  for (const department of runtime?.departments || [])
    for (const agent of department.agents || [])
      index.set(agent.agentId, {
        departmentId: department.departmentId,
        name: department.name || department.departmentId,
        jobs: finite(agent.jobs?.total),
      });
  return index;
}

export function latestCompletion(runtime) {
  return runtime?.modelRuntime?.recentCompletions?.[0] || null;
}

/**
 * Host telemetry. Yusuf OS exposes no CPU/GPU/memory/network metrics, so these
 * are declared NOT_REPORTED by construction — a test locks that in.
 */
export const HOST_METRICS = Object.freeze(["CPU", "GPU", "MEM", "NET"]);

export function buildTelemetry({ summary, runtime, runtimePhase, connection }) {
  const ollama = runtime?.modelRuntime?.ollama || null;
  const openai = runtime?.modelRuntime?.openai || null;
  let model = NA.LOADING;
  if (runtime)
    model = ollama?.reachable
      ? "OLLAMA"
      : openai?.configured
        ? "OPENAI"
        : "NONE";
  else if (runtimePhase === "ERROR") model = NA.UNAVAILABLE;
  return {
    host: HOST_METRICS.map((key) => ({ key, value: NA.NOT_REPORTED })),
    controlPlane: summary?.controlPlane || null,
    audit: summary?.auditStatus || null,
    connection: connection || null,
    model,
    ollamaModels: ollama?.reachable ? (ollama.models?.length ?? null) : null,
    agents: summary
      ? { reporting: summary.agentsReporting, total: summary.agentsTotal }
      : null,
  };
}

/** The six compact panels around the Core. */
export function buildCorePanels({ summary, runtime, runtimePhase, dashboard }) {
  const loadingRuntime = !runtime && runtimePhase !== "ERROR";
  const runtimeValue = (value) =>
    runtime
      ? (value ?? NA.UNAVAILABLE)
      : loadingRuntime
        ? NA.LOADING
        : NA.UNAVAILABLE;
  const latest = latestCompletion(runtime);
  const ollama = runtime?.modelRuntime?.ollama;
  const openai = runtime?.modelRuntime?.openai;
  const policies = runtime?.modelRuntime?.agentModelPolicies || [];
  const kem = runtime?.knowledgeEvidenceMemory;
  const checks = runtime?.monitoring?.checks || [];
  const adapters = dashboard?.adapterHealth || [];

  return {
    PROCESSING: {
      value: summary ? summary.activeRuns : null,
      valueKey: "activeRuns",
      lines: [
        [
          "latency",
          runtimeValue(latest ? finite(latest.latencyMs) : NA.NOT_REPORTED),
          "ms",
        ],
        [
          "tokens",
          runtimeValue(
            latest
              ? latest.usage?.confidence === "UNAVAILABLE"
                ? NA.NOT_REPORTED
                : finite(latest.usage?.totalTokens)
              : NA.NOT_REPORTED
          ),
        ],
        [
          "lastModel",
          runtimeValue(latest ? latest.model : NA.NOT_REPORTED),
          null,
          true,
        ],
      ],
    },
    INTELLIGENCE: {
      // Only a reachable daemon's list is a real count.
      value:
        runtime && ollama?.reachable ? (ollama.models?.length ?? null) : null,
      valueKey: "localModels",
      lines: [
        [
          "ollama",
          runtimeValue(
            ollama
              ? ollama.reachable
                ? "REACHABLE"
                : ollama.status || NA.UNAVAILABLE
              : null
          ),
        ],
        [
          "openai",
          runtimeValue(
            openai
              ? openai.configured
                ? "CONFIGURED"
                : "NOT_CONFIGURED"
              : null
          ),
        ],
        [
          "routing",
          runtimeValue(
            policies.length
              ? [
                  ...new Set(
                    policies.map((p) => p.routingPolicy).filter(Boolean)
                  ),
                ].join(" · ") || NA.NOT_REPORTED
              : NA.NOT_REPORTED
          ),
          null,
          true,
        ],
      ],
    },
    KNOWLEDGE: {
      value: runtime ? finite(kem?.knowledge?.total) : null,
      valueKey: "knowledgeItems",
      lines: [
        ["memory", runtimeValue(finite(kem?.memory?.total))],
        ["evidence", runtimeValue(kem ? sum(kem.evidence?.byClass) : null)],
        ["tombstoned", runtimeValue(finite(kem?.evidence?.tombstoned))],
      ],
    },
    AUTOMATION: {
      value: summary ? summary.totalTasksInWindow : null,
      valueKey: "tasksInWindow",
      lines: [
        ["running", summary ? summary.activeTasks : NA.LOADING],
        [
          "waitingApproval",
          summary ? summary.waitingApprovalTasks : NA.LOADING,
        ],
        ["handoffs", summary ? summary.activeHandoffs : NA.LOADING],
      ],
    },
    TOOLS: {
      value: summary
        ? `${summary.adaptersAvailable} / ${summary.adaptersTotal}`
        : null,
      valueKey: "adaptersAvailable",
      lines: [
        [
          "capabilities",
          summary
            ? adapters.every((a) => finite(a.capabilityCount) !== null)
              ? adapters.reduce((total, a) => total + a.capabilityCount, 0)
              : NA.NOT_REPORTED
            : NA.LOADING,
        ],
        [
          "unavailable",
          summary
            ? summary.adaptersTotal - summary.adaptersAvailable
            : NA.LOADING,
        ],
        [
          "reconciliation",
          summary
            ? (summary.pendingReconciliation ?? NA.NOT_REPORTED)
            : NA.LOADING,
        ],
      ],
    },
    HEALTH: {
      value: summary?.controlPlane || null,
      valueKey: "controlPlane",
      lines: [
        ["audit", summary ? summary.auditStatus : NA.LOADING],
        [
          "emergencyStop",
          summary
            ? summary.emergencyStop === null
              ? NA.NOT_REPORTED
              : summary.emergencyStop
                ? "ON"
                : "OFF"
            : NA.LOADING,
        ],
        [
          "monitoring",
          runtimeValue(
            runtime?.monitoring?.available === false
              ? NA.UNAVAILABLE
              : checks[0]?.status || NA.NOT_REPORTED
          ),
        ],
      ],
    },
  };
}

/**
 * The current operation strip. Prefers a run with real gate progress, then a
 * running task, then the in-flight command. Never fabricates a percentage.
 */
export function buildCurrentOperation({
  dashboard,
  agents,
  runtime,
  commandPhase,
  lastCommand,
}) {
  const run = dashboard?.runProgress?.[0] || null;
  const runningTask =
    (dashboard?.taskStatuses || []).find((task) => task.status === "RUNNING") ||
    null;
  const completions = runtime?.modelRuntime?.recentCompletions || [];

  let operation = null;
  if (run) {
    const total = finite(run.totalGates);
    const done = finite(run.completedGates);
    operation = {
      kind: "RUN",
      taskId: run.taskId || null,
      runId: run.runId || null,
      state: run.state || null,
      progress:
        total && total > 0 && done !== null
          ? { done, total, ratio: Math.min(1, Math.max(0, done / total)) }
          : null,
    };
  } else if (runningTask) {
    operation = {
      kind: "TASK",
      taskId: runningTask.taskId,
      runId: null,
      state: runningTask.status,
      progress: null,
      updatedAt: runningTask.updatedAt || null,
    };
  } else if (commandPhase === "PROCESSING") {
    operation = {
      kind: "COMMAND",
      taskId: null,
      runId: null,
      state: "PROCESSING",
      progress: null,
    };
  } else if (lastCommand?.taskId) {
    operation = {
      kind: "LAST_COMMAND",
      taskId: lastCommand.taskId,
      runId: lastCommand.runId,
      state: lastCommand.state,
      progress: null,
    };
  }
  if (!operation) return null;

  const agent = operation.taskId
    ? (agents || []).find(
        (candidate) => candidate.activeTaskId === operation.taskId
      ) || null
    : (agents || []).find(
        (candidate) => candidate.agentId === "chief_of_staff"
      ) || null;
  const completion =
    (operation.runId &&
      completions.find((entry) => entry.runId === operation.runId)) ||
    null;
  return {
    ...operation,
    agentId: agent?.agentId || null,
    agentName: agent?.name || null,
    model: completion?.model || null,
    provider: completion?.provider || null,
    routingPolicy: completion?.routingPolicy || null,
  };
}
