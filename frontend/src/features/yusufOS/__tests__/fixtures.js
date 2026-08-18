/**
 * Deterministic fixtures shaped exactly like the Gate F projections.
 *
 * These are test fixtures, never rendered in the product. Nothing in the
 * application ships sample data — the only reason these exist is so the
 * mapping and rendering rules can be asserted without a live server.
 */

export function dashboardFixture(overrides = {}) {
  return {
    asOf: "2026-08-18T09:00:00.000Z",
    projectionVersion: 1,
    eventCursor: "42",
    systemStatus: {
      controlPlane: "HEALTHY",
      emergencyStop: false,
      pendingReconciliation: 0,
    },
    agentStatuses: [
      { agentId: "chief_of_staff", status: "IDLE" },
      {
        agentId: "engineering",
        status: "RUNNING",
        activeTaskId: "task-1",
        currentRunId: "run-1",
      },
      { agentId: "reviewer", status: "IDLE" },
    ],
    taskStatuses: [
      {
        taskId: "task-1",
        status: "RUNNING",
        priority: "P2",
        updatedAt: "2026-08-18T08:59:00.000Z",
      },
    ],
    approvalAttentionQueue: [],
    activeHandoffs: [],
    runProgress: [],
    adapterHealth: [
      {
        adapterId: "local-git",
        kind: "git",
        status: "AVAILABLE",
        capabilityCount: 7,
      },
    ],
    auditSummary: { chainStatus: "UNCHECKED", lastSequence: 42 },
    costSummary: { todayMicros: 0, monthMicros: 0, currency: "USD" },
    ...overrides,
  };
}

export function rosterFixture(overrides = {}) {
  return {
    agents: [
      {
        agentId: "chief_of_staff",
        name: "Chief of Staff",
        mission: "Orchestrate.",
        lifecycleStatus: "ACTIVE",
        capabilityCount: 0,
        capabilityKeys: [],
        maxConcurrentRuns: 1,
        createdAt: "2026-08-17T00:00:00.000Z",
      },
      {
        agentId: "engineering",
        name: "Engineering",
        mission: "Implement.",
        lifecycleStatus: "ACTIVE",
        capabilityCount: 4,
        capabilityKeys: ["project.write_file"],
        maxConcurrentRuns: 1,
        createdAt: "2026-08-17T00:00:01.000Z",
      },
      {
        agentId: "reviewer",
        name: "Reviewer",
        mission: "Review.",
        lifecycleStatus: "ACTIVE",
        capabilityCount: 2,
        capabilityKeys: [],
        maxConcurrentRuns: 1,
        createdAt: "2026-08-17T00:00:02.000Z",
      },
    ],
    ...overrides,
  };
}

export function envelope(sequence, overrides = {}) {
  return {
    id: `event-${sequence}`,
    sequence,
    schemaVersion: 1,
    type: "agent.run.started",
    occurredAt: "2026-08-18T09:00:00.000Z",
    aggregateType: "run",
    aggregateId: "run-1",
    data: { outcome: "STARTED" },
    ...overrides,
  };
}
