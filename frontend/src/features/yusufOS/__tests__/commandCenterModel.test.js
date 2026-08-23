import { describe, expect, test } from "vitest";
import {
  buildAgents,
  buildEdges,
  orphanedEdges,
  deriveCoreState,
  buildSummary,
  buildAttentionQueue,
  CORE_STATES,
} from "../state/commandCenterModel";
import { TONES } from "../state/statusSemantics";
import { dashboardFixture, rosterFixture } from "./fixtures";

describe("projection mapping", () => {
  test("merges roster identity with live status", () => {
    const agents = buildAgents(dashboardFixture(), rosterFixture());
    expect(agents).toHaveLength(3);
    const engineering = agents.find((a) => a.agentId === "engineering");
    expect(engineering.name).toBe("Engineering");
    expect(engineering.status).toBe("RUNNING");
    expect(engineering.activeTaskId).toBe("task-1");
    expect(engineering.capabilityCount).toBe(4);
  });

  test("an agent with zero capabilities keeps its real zero", () => {
    const agents = buildAgents(dashboardFixture(), rosterFixture());
    const chief = agents.find((a) => a.agentId === "chief_of_staff");
    // The Chief of Staff genuinely holds no capabilities. That must survive as
    // 0, not be conflated with "unknown".
    expect(chief.capabilityCount).toBe(0);
    expect(chief.capabilityCount).not.toBeNull();
  });

  test("an agent with no status row is unknown, not idle", () => {
    const dashboard = dashboardFixture({ agentStatuses: [] });
    const agents = buildAgents(dashboard, rosterFixture());
    expect(agents.every((agent) => agent.status === null)).toBe(true);
    expect(agents.every((agent) => agent.tone === TONES.UNKNOWN)).toBe(true);
  });

  test("a status row with no roster entry renders as unknown identity", () => {
    const dashboard = dashboardFixture({
      agentStatuses: [{ agentId: "ghost", status: "RUNNING" }],
    });
    const agents = buildAgents(dashboard, rosterFixture());
    const ghost = agents.find((agent) => agent.agentId === "ghost");
    expect(ghost.hasIdentity).toBe(false);
    expect(ghost.capabilityCount).toBeNull();
  });
});

describe("relationship edges", () => {
  const withHandoff = (handoffs) =>
    dashboardFixture({ activeHandoffs: handoffs });

  test("only persisted handoffs become edges", () => {
    const dashboard = withHandoff([
      {
        fromAgentId: "chief_of_staff",
        toAgentId: "engineering",
        taskId: "task-1",
        gate: "DELEGATED_FOR_IMPLEMENTATION",
        status: "ACCEPTED",
      },
    ]);
    const agents = buildAgents(dashboard, rosterFixture());
    const edges = buildEdges(dashboard, agents);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      fromAgentId: "chief_of_staff",
      toAgentId: "engineering",
      active: true,
    });
  });

  test("no handoffs means no edges — none are invented", () => {
    const dashboard = dashboardFixture();
    const agents = buildAgents(dashboard, rosterFixture());
    expect(buildEdges(dashboard, agents)).toEqual([]);
  });

  test("motion is reserved for handoffs the server marks live", () => {
    const dashboard = withHandoff([
      {
        fromAgentId: "chief_of_staff",
        toAgentId: "engineering",
        taskId: "task-1",
        gate: "DELEGATED",
        status: "PENDING",
      },
    ]);
    const agents = buildAgents(dashboard, rosterFixture());
    expect(buildEdges(dashboard, agents)[0].active).toBe(false);
  });

  test("an edge referencing a missing agent is dropped, not drawn, and is reported", () => {
    const dashboard = withHandoff([
      {
        fromAgentId: "engineering",
        toAgentId: "does_not_exist",
        taskId: "task-1",
        gate: "DELEGATED",
        status: "ACCEPTED",
      },
    ]);
    const agents = buildAgents(
      dashboardFixture({ activeHandoffs: dashboard.activeHandoffs }),
      rosterFixture()
    );
    expect(buildEdges(dashboard, agents)).toEqual([]);
    expect(orphanedEdges(dashboard, agents)).toHaveLength(1);
  });
});

describe("core state precedence", () => {
  test("a clean, idle system is healthy", () => {
    const idle = dashboardFixture({
      agentStatuses: [
        { agentId: "chief_of_staff", status: "IDLE" },
        { agentId: "engineering", status: "IDLE" },
      ],
    });
    expect(deriveCoreState(idle)).toBe(CORE_STATES.HEALTHY);
  });

  test("a running agent makes the core working", () => {
    expect(
      deriveCoreState(
        dashboardFixture({
          agentStatuses: [{ agentId: "engineering", status: "RUNNING" }],
        })
      )
    ).toBe(CORE_STATES.WORKING);
  });

  test("a pending approval outranks activity", () => {
    const state = deriveCoreState(
      dashboardFixture({
        approvalAttentionQueue: [{ approvalId: "a-1", riskLevel: "L3" }],
      })
    );
    expect(state).toBe(CORE_STATES.WAITING_APPROVAL);
  });

  test("a broken audit chain outranks a pending approval", () => {
    const state = deriveCoreState(
      dashboardFixture({
        approvalAttentionQueue: [{ approvalId: "a-1", riskLevel: "L3" }],
        auditSummary: { chainStatus: "BROKEN", lastSequence: 42 },
      })
    );
    expect(state).toBe(CORE_STATES.SECURITY_ALERT);
  });

  test("the kill switch outranks everything", () => {
    const state = deriveCoreState(
      dashboardFixture({
        systemStatus: {
          controlPlane: "HEALTHY",
          emergencyStop: true,
          pendingReconciliation: 3,
        },
        auditSummary: { chainStatus: "BROKEN", lastSequence: 42 },
      })
    );
    expect(state).toBe(CORE_STATES.EMERGENCY_STOP);
  });

  test("unverified external effects are their own state, not a generic error", () => {
    const state = deriveCoreState(
      dashboardFixture({
        systemStatus: {
          controlPlane: "HEALTHY",
          emergencyStop: false,
          pendingReconciliation: 2,
        },
      })
    );
    expect(state).toBe(CORE_STATES.RECONCILING);
  });

  test("no dashboard means no core state — not a healthy default", () => {
    expect(deriveCoreState(null)).toBeNull();
  });
});

describe("summary", () => {
  test("reports real counts and never estimates cost", () => {
    const dashboard = dashboardFixture();
    const summary = buildSummary(
      dashboard,
      buildAgents(dashboard, rosterFixture())
    );
    expect(summary.agentsTotal).toBe(3);
    expect(summary.agentsReporting).toBe(3);
    expect(summary.pendingApprovals).toBe(0);
    expect(summary.costTodayMicros).toBe(0);
    expect(summary.auditStatus).toBe("UNCHECKED");
  });

  test("returns null rather than zeroes when there is no snapshot", () => {
    expect(buildSummary(null, [])).toBeNull();
  });
});

describe("attention queue", () => {
  test("an empty queue is null while unknown and [] when proven empty", () => {
    expect(buildAttentionQueue(null)).toBeNull();
    expect(buildAttentionQueue(dashboardFixture())).toEqual([]);
  });

  test("orders by how hard each item blocks the operator", () => {
    const dashboard = dashboardFixture({
      approvalAttentionQueue: [
        {
          approvalId: "a-1",
          intentId: "i-1",
          capabilityKey: "git.push_feature_branch",
          riskLevel: "L3",
          targetSummary: "push",
          expiresAt: "2026-08-18T10:00:00.000Z",
        },
      ],
      taskStatuses: [
        {
          taskId: "task-9",
          status: "BLOCKED",
          priority: "P1",
          blockingReason: "review blocked",
          updatedAt: "2026-08-18T08:00:00.000Z",
        },
      ],
      adapterHealth: [
        {
          adapterId: "local-git",
          kind: "git",
          status: "UNAVAILABLE",
          capabilityCount: 7,
        },
      ],
    });
    const queue = buildAttentionQueue(dashboard);
    expect(queue.map((item) => item.kind)).toEqual([
      "TASK_BLOCKED",
      "APPROVAL_PENDING",
      "ADAPTER_OFFLINE",
    ]);
    // Every item goes somewhere real.
    expect(queue.every((item) => item.href.startsWith("/os/"))).toBe(true);
  });

  test("a stale audit verdict is surfaced rather than shown as green", () => {
    const queue = buildAttentionQueue(
      dashboardFixture({
        auditSummary: {
          chainStatus: "STALE",
          lastSequence: 200,
          verifiedThroughSequence: 40,
        },
      })
    );
    expect(queue.map((item) => item.kind)).toContain("AUDIT_STALE");
  });

  test("surfaces durable notification attention without inventing an approval", () => {
    const queue = buildAttentionQueue(
      dashboardFixture({
        notificationAttentionQueue: [
          {
            notificationId: "notice-1",
            kind: "SCHEDULER_FAILURE",
            severity: "WARNING",
            summary: "Retention retry is pending.",
          },
        ],
      })
    );
    expect(queue).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "notification:notice-1",
          kind: "NOTIFICATION",
          tone: TONES.WARNING,
          href: "/os/system",
          values: expect.objectContaining({
            notificationKind: "SCHEDULER_FAILURE",
          }),
        }),
      ])
    );
  });

  test("UNCHECKED does not raise a false alarm and does not read as healthy", () => {
    // UNCHECKED is not an attention item (nothing is known to be wrong), but it
    // is also never rendered as VALID — that is asserted in the status tests.
    expect(buildAttentionQueue(dashboardFixture())).toEqual([]);
  });
});
