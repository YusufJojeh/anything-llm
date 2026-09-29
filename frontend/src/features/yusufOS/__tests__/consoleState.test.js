import { describe, expect, test } from "vitest";
import { CORE_MODES, deriveCoreMode, coreModeParams } from "../state/coreMode";
import { deriveStages, STAGE_STATUS } from "../state/operationStages";
import {
  HOST_METRICS,
  NA,
  buildCorePanels,
  buildCurrentOperation,
  buildTelemetry,
  departmentIndex,
} from "../state/consoleModel";
import { buildSummary, buildAgents } from "../state/commandCenterModel";
import {
  realtimeReducer,
  initialRealtimeState,
} from "../realtime/eventReducer";
import { dashboardFixture, rosterFixture, envelope } from "./fixtures";

describe("System Core mode", () => {
  test("unknown state is neutral, never healthy", () => {
    expect(deriveCoreMode({ coreState: null })).toBe(CORE_MODES.UNKNOWN);
    expect(coreModeParams(CORE_MODES.UNKNOWN).spin).toBeNull();
  });

  test("safety outranks voice activity", () => {
    for (const coreState of ["EMERGENCY_STOP", "SECURITY_ALERT", "BLOCKED"])
      expect(deriveCoreMode({ coreState, voicePhase: "LISTENING" })).toBe(
        CORE_MODES.BLOCKED
      );
  });

  test("offline connection dims the core", () => {
    expect(
      deriveCoreMode({ coreState: "HEALTHY", connection: "OFFLINE" })
    ).toBe(CORE_MODES.OFFLINE);
  });

  test("real voice phases drive listening/speaking", () => {
    expect(
      deriveCoreMode({ coreState: "HEALTHY", voicePhase: "LISTENING" })
    ).toBe(CORE_MODES.LISTENING);
    expect(
      deriveCoreMode({ coreState: "WORKING", voicePhase: "SPEAKING" })
    ).toBe(CORE_MODES.SPEAKING);
  });

  test("approval is amber, warnings are amber-slow", () => {
    expect(deriveCoreMode({ coreState: "WAITING_APPROVAL" })).toBe(
      CORE_MODES.WAITING_APPROVAL
    );
    // A stale local command result never holds the Core amber.
    expect(
      deriveCoreMode({ coreState: "HEALTHY", voicePhase: "APPROVAL_REQUIRED" })
    ).toBe(CORE_MODES.HEALTHY);
    expect(coreModeParams(CORE_MODES.WAITING_APPROVAL).hue).toBe("amber");
    expect(deriveCoreMode({ coreState: "RECONCILING" })).toBe(
      CORE_MODES.WARNING
    );
  });

  test("stages and processing select thinking/tool execution", () => {
    expect(
      deriveCoreMode({ coreState: "HEALTHY", voicePhase: "PROCESSING" })
    ).toBe(CORE_MODES.THINKING);
    expect(
      deriveCoreMode({ coreState: "WORKING", stages: { EXECUTE: "ACTIVE" } })
    ).toBe(CORE_MODES.TOOL_EXECUTION);
    expect(deriveCoreMode({ coreState: "WORKING" })).toBe(CORE_MODES.WORKING);
    expect(deriveCoreMode({ coreState: "HEALTHY" })).toBe(CORE_MODES.HEALTHY);
  });

  test("is deterministic", () => {
    const input = { coreState: "WORKING", voicePhase: "IDLE", stages: null };
    expect(deriveCoreMode(input)).toBe(deriveCoreMode(input));
  });
});

describe("runtime stages", () => {
  const now = Date.parse("2026-08-18T09:00:30.000Z");
  const at = (secondsAgo) => new Date(now - secondsAgo * 1000).toISOString();

  test("LEARN is never faked", () => {
    expect(deriveStages({ recentEvents: [], now }).LEARN).toBe(
      STAGE_STATUS.NOT_REPORTED
    );
  });

  test("newest stage event is active; older ones recent; stale ones idle", () => {
    const stages = deriveStages({
      now,
      recentEvents: [
        { type: "execution.verified", receivedAt: at(2) },
        { type: "execution.claimed", receivedAt: at(8) },
        { type: "intent.created", receivedAt: at(300) },
      ],
    });
    expect(stages.VERIFY).toBe(STAGE_STATUS.ACTIVE);
    expect(stages.EXECUTE).toBe(STAGE_STATUS.RECENT);
    expect(stages.PLAN).toBe(STAGE_STATUS.IDLE);
  });

  test("an in-flight command is a real REASON stage; unknown event types are ignored", () => {
    const stages = deriveStages({
      now,
      voicePhase: "PROCESSING",
      recentEvents: [{ type: "made.up", receivedAt: at(1) }],
    });
    expect(stages.REASON).toBe(STAGE_STATUS.ACTIVE);
  });
});

describe("console model truthfulness", () => {
  const dashboard = dashboardFixture();
  const agents = buildAgents(dashboard, rosterFixture());
  const summary = buildSummary(dashboard, agents);

  test("host CPU/GPU/MEM/NET are declared NOT_REPORTED, never numbers", () => {
    const telemetry = buildTelemetry({
      summary,
      runtime: null,
      runtimePhase: "LOADING",
    });
    expect(telemetry.host.map((m) => m.key)).toEqual([...HOST_METRICS]);
    for (const metric of telemetry.host)
      expect(metric.value).toBe(NA.NOT_REPORTED);
    expect(telemetry.model).toBe(NA.LOADING);
    expect(
      buildTelemetry({ summary, runtime: null, runtimePhase: "ERROR" }).model
    ).toBe(NA.UNAVAILABLE);
  });

  test("runtime-backed panel values are unavailable, not zero, when runtime failed", () => {
    const panels = buildCorePanels({
      summary,
      runtime: null,
      runtimePhase: "ERROR",
      dashboard,
    });
    expect(panels.KNOWLEDGE.value).toBeNull();
    expect(panels.PROCESSING.lines[0][1]).toBe(NA.UNAVAILABLE);
    expect(panels.INTELLIGENCE.value).toBeNull();
    // Dashboard-backed values stay real.
    expect(panels.PROCESSING.value).toBe(0);
    expect(panels.TOOLS.value).toBe("1 / 1");
  });

  test("unavailable token usage is not reported as a count", () => {
    const runtime = {
      modelRuntime: {
        recentCompletions: [
          {
            runId: "r",
            latencyMs: 12,
            usage: { confidence: "UNAVAILABLE" },
            model: "m",
          },
        ],
      },
    };
    const panels = buildCorePanels({
      summary,
      runtime,
      runtimePhase: "READY",
      dashboard,
    });
    expect(panels.PROCESSING.lines[1][1]).toBe(NA.NOT_REPORTED);
    expect(panels.PROCESSING.lines[0][1]).toBe(12);
  });

  test("progress only exists when the backend reports gates", () => {
    const withGates = buildCurrentOperation({
      dashboard: dashboardFixture({
        runProgress: [
          {
            runId: "r1",
            taskId: "task-1",
            state: "RUNNING",
            completedGates: 2,
            totalGates: 6,
          },
        ],
      }),
      agents,
    });
    expect(withGates.progress).toEqual({ done: 2, total: 6, ratio: 2 / 6 });
    expect(withGates.agentId).toBe("engineering");

    const noGates = buildCurrentOperation({
      dashboard: dashboardFixture({
        runProgress: [{ runId: "r1", taskId: "task-1", state: "RUNNING" }],
      }),
      agents,
    });
    expect(noGates.progress).toBeNull();

    const taskOnly = buildCurrentOperation({ dashboard, agents });
    expect(taskOnly.kind).toBe("TASK");
    expect(taskOnly.progress).toBeNull();
  });

  test("no operation at all is null, not an invented one", () => {
    expect(
      buildCurrentOperation({
        dashboard: dashboardFixture({ taskStatuses: [] }),
        agents,
      })
    ).toBeNull();
  });

  test("department index comes only from the runtime organisation", () => {
    const index = departmentIndex({
      departments: [
        {
          departmentId: "eng",
          name: "Engineering",
          agents: [{ agentId: "engineering", jobs: { total: 3 } }],
        },
      ],
    });
    expect(index.get("engineering")).toMatchObject({
      name: "Engineering",
      jobs: 3,
    });
    expect(departmentIndex(null).size).toBe(0);
  });
});

describe("realtime recent-event buffer", () => {
  test("keeps safe summaries only, newest first, without duplicates", () => {
    let state = initialRealtimeState(0);
    state = realtimeReducer(state, {
      type: "event",
      envelope: envelope(1, { data: { secret: "x" } }),
      at: "2026-08-18T09:00:01.000Z",
    });
    state = realtimeReducer(state, { type: "event", envelope: envelope(1) });
    state = realtimeReducer(state, {
      type: "event",
      envelope: envelope(2, { type: "execution.verified" }),
      at: "2026-08-18T09:00:02.000Z",
    });
    expect(state.recent).toHaveLength(2);
    expect(state.recent[0].type).toBe("execution.verified");
    expect(state.recent[1]).not.toHaveProperty("data");
    expect(Object.keys(state.recent[1]).sort()).toEqual(
      [
        "aggregateId",
        "aggregateType",
        "id",
        "occurredAt",
        "receivedAt",
        "sequence",
        "type",
      ].sort()
    );
  });
});

describe("review regressions", () => {
  test("stage recency uses when the event occurred, not when a backlog arrived", () => {
    const now = Date.parse("2026-08-18T09:10:00.000Z");
    const stages = deriveStages({
      now,
      recentEvents: [
        {
          type: "execution.claimed",
          occurredAt: "2026-08-18T08:00:00.000Z",
          receivedAt: new Date(now - 1000).toISOString(),
        },
      ],
    });
    expect(stages.EXECUTE).toBe(STAGE_STATUS.IDLE);
  });

  test("unknown counts stay unknown rather than zero", () => {
    const dashboard = dashboardFixture({
      adapterHealth: [{ adapterId: "a", status: "AVAILABLE" }],
    });
    const agents = buildAgents(dashboard, rosterFixture());
    const summary = buildSummary(dashboard, agents);
    const panels = buildCorePanels({
      summary,
      runtime: {
        modelRuntime: { ollama: { reachable: false, models: [] } },
        knowledgeEvidenceMemory: {
          knowledge: { total: 1 },
          memory: { total: 0 },
        },
      },
      runtimePhase: "READY",
      dashboard,
    });
    expect(panels.INTELLIGENCE.value).toBeNull();
    expect(panels.KNOWLEDGE.lines[1][1]).toBe(NA.UNAVAILABLE);
    expect(panels.TOOLS.lines[0][1]).toBe(NA.NOT_REPORTED);
  });
});
