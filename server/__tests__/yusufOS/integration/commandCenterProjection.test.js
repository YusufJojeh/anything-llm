const express = require("express");
const bodyParser = require("body-parser");
const { randomUUID } = require("crypto");
const { yusufOSEndpoints } = require("../../../endpoints/yusufOS");
const {
  createTestDatabase,
  clearYusufTables,
} = require("../../../__testUtils__/yusufOS/testDatabase");
const { createAgentFixture } = require("../../../__testUtils__/yusufOS/agentFixture");
const { ChiefOfStaff } = require("../../../domain/yusufOS/orchestration/ChiefOfStaff");
const {
  AgentRunCoordinator,
} = require("../../../domain/yusufOS/agents/AgentRunCoordinator");
const {
  DashboardProjection,
  resetProjectionCaches,
} = require("../../../domain/yusufOS/projections/DashboardProjection");
const {
  EventProjection,
  FORWARDABLE_METADATA_KEYS,
} = require("../../../domain/yusufOS/projections/EventProjection");
const {
  SecuritySettings,
} = require("../../../domain/yusufOS/security/SecuritySettings");
const { AGENT_KEYS, RUN_KINDS } = require("../../../domain/yusufOS/constants");

describe("Gate F — Command Center projections", () => {
  let testDatabase;
  let db;
  let server;
  let baseUrl;
  let fixture;
  const token = "gate-f-control-token-that-is-at-least-32-characters";

  beforeAll(async () => {
    process.env.YUSUF_OS_CONTROL_TOKEN = token;
    testDatabase = await createTestDatabase();
    db = testDatabase.db;
    const app = express();
    app.use(bodyParser.json({ limit: "256kb" }));
    const router = express.Router();
    app.use("/api", router);
    yusufOSEndpoints(router, { db });
    await new Promise((resolve) => {
      server = app.listen(0, "127.0.0.1", resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}/api/yusuf-os`;
  }, 120000);

  afterAll(async () => {
    delete process.env.YUSUF_OS_CONTROL_TOKEN;
    if (server) await new Promise((resolve) => server.close(resolve));
    if (testDatabase) await testDatabase.cleanup();
  });

  test("projects durable scheduler health and open notifications without exposing internal records", async () => {
    const now = new Date();
    await db.yusuf_schedules.create({
      data: {
        uuid: randomUUID(),
        scheduleKey: "EVIDENCE_RETENTION",
        kind: "EVIDENCE_RETENTION",
        intervalSeconds: 3600,
        nextRunAt: now,
        failureCount: 2,
        lastErrorCode: "SCHEDULE_EXECUTION_FAILED",
        workerLastFailureAt: now,
        workerLastErrorCode: "SCHEDULER_WORKER_FAILED",
      },
    });
    await db.yusuf_notifications.create({
      data: {
        uuid: randomUUID(),
        kind: "SCHEDULER_FAILURE",
        severity: "WARNING",
        dedupeKey: "scheduler:EVIDENCE_RETENTION",
        summary: "Retention retry pending; token=should-not-leak",
      },
    });
    const dashboard = await new DashboardProjection(db).build();
    expect(dashboard.scheduler).toEqual([
      expect.objectContaining({
        scheduleKey: "EVIDENCE_RETENTION",
        failureCount: 2,
        lastErrorCode: "SCHEDULE_EXECUTION_FAILED",
      }),
    ]);
    expect(dashboard.notificationAttentionQueue).toEqual([
      expect.objectContaining({ kind: "SCHEDULER_FAILURE", severity: "WARNING" }),
    ]);
    expect(JSON.stringify(dashboard)).not.toContain("should-not-leak");
  });

  test("marks a stale scheduler worker heartbeat degraded rather than operational", async () => {
    await db.yusuf_schedules.create({
      data: {
        uuid: randomUUID(), scheduleKey: "EVIDENCE_RETENTION", kind: "EVIDENCE_RETENTION",
        intervalSeconds: 3600, nextRunAt: new Date(),
        workerLastTickAt: new Date(Date.now() - 91 * 1000),
      },
    });
    const dashboard = await new DashboardProjection(db).build();
    expect(dashboard.scheduler[0]).toMatchObject({ workerStatus: "DEGRADED" });
  });

  test("marks a newer scheduler worker failure degraded even with a fresh prior tick", async () => {
    const now = Date.now();
    await db.yusuf_schedules.create({
      data: {
        uuid: randomUUID(), scheduleKey: "EVIDENCE_RETENTION", kind: "EVIDENCE_RETENTION",
        intervalSeconds: 3600, nextRunAt: new Date(now),
        workerLastTickAt: new Date(now - 30 * 1000),
        workerLastFailureAt: new Date(now - 1000),
        workerLastErrorCode: "SCHEDULER_WORKER_FAILED",
      },
    });
    const dashboard = await new DashboardProjection(db).build();
    expect(dashboard.scheduler[0]).toMatchObject({
      workerStatus: "DEGRADED", workerLastErrorCode: "SCHEDULER_WORKER_FAILED",
    });
  });

  beforeEach(async () => {
    await clearYusufTables(db);
    resetProjectionCaches();
    fixture = await createAgentFixture({ db });
  });

  afterEach(() => {
    if (fixture) fixture.cleanup();
  });

  const request = (path, options = {}) =>
    fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        ...(options.headers || {}),
      },
    });

  test("projection routes require Yusuf control-plane authentication", async () => {
    for (const path of ["/dashboard", "/events", "/events/stream"]) {
      const response = await fetch(`${baseUrl}${path}`);
      expect(response.status).toBe(401);
    }
  });

  test("dashboard reports an empty-but-honest system before any work exists", async () => {
    const response = await request("/dashboard");
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.projectionVersion).toBe(1);
    expect(typeof body.asOf).toBe("string");
    expect(body.systemStatus).toMatchObject({
      controlPlane: "HEALTHY",
      emergencyStop: false,
      pendingReconciliation: 0,
    });
    // Nine seeded agents (Phase K adds Monitoring, Phase L adds Career, Phase M adds Marketing, Phase N adds Founder, Phase O adds Research, Phase P adds Inbox), all idle — not "busy" placeholders.
    expect(body.agentStatuses).toHaveLength(9);
    expect(body.agentStatuses.every((a) => a.status === "IDLE")).toBe(true);
    expect(body.approvalAttentionQueue).toEqual([]);
    expect(body.activeHandoffs).toEqual([]);
    // Nothing has been verified yet, so the honest answer is UNCHECKED rather
    // than an optimistic VALID.
    expect(body.auditSummary.chainStatus).toBe("UNCHECKED");
    expect(body.costSummary).toMatchObject({
      todayMicros: 0,
      monthMicros: 0,
      currency: "USD",
    });
  });

  test("dashboard reflects real delegation, handoffs, and agent states", async () => {
    const chief = new ChiefOfStaff(db);
    const runs = new AgentRunCoordinator(db);
    const task = await fixture.createTask({});
    const delegation = await chief.delegate({
      taskId: task.id,
      toAgentKey: AGENT_KEYS.ENGINEERING,
      requestId: randomUUID(),
    });
    await chief.markTaskRunning({ taskId: task.id });
    await runs.startRun({ runId: delegation.run.id, requestId: randomUUID() });

    const body = await (await request("/dashboard")).json();

    const engineering = body.agentStatuses.find(
      (a) => a.agentId === AGENT_KEYS.ENGINEERING
    );
    expect(engineering.status).toBe("RUNNING");
    expect(engineering.activeTaskId).toBe(task.uuid);
    expect(engineering.currentRunId).toBe(delegation.run.uuid);

    expect(body.taskStatuses[0]).toMatchObject({
      taskId: task.uuid,
      status: "RUNNING",
      priority: "P2",
    });

    // A real delegation edge, sourced from yusuf_handoffs.
    expect(body.activeHandoffs).toHaveLength(1);
    expect(body.activeHandoffs[0]).toMatchObject({
      fromAgentId: AGENT_KEYS.CHIEF_OF_STAFF,
      toAgentId: AGENT_KEYS.ENGINEERING,
      taskId: task.uuid,
      gate: "DELEGATED_FOR_IMPLEMENTATION",
    });

    // Gate counts are real: nothing proven yet, so most gates are unsatisfied.
    expect(body.runProgress).toHaveLength(1);
    expect(body.runProgress[0]).toMatchObject({
      runId: delegation.run.uuid,
      taskId: task.uuid,
      totalGates: 6,
    });
    expect(body.runProgress[0].completedGates).toBeLessThan(6);
  });

  test("the kill switch surfaces as an emergency stop", async () => {
    await new SecuritySettings(db).setExternalMutationsDisabled(true, {
      principal: { type: "USER", id: "yusuf" },
      requestId: randomUUID(),
    });
    const body = await (await request("/dashboard")).json();
    expect(body.systemStatus.emergencyStop).toBe(true);
  });

  test("adapter health reports real availability, not an assumption", async () => {
    const body = await (await request("/dashboard")).json();
    const ids = body.adapterHealth.map((a) => a.adapterId).sort();
    // Phase H added the Browser Broker. It is listed even while disabled — an
    // adapter the operator cannot see is an adapter they cannot reason about.
    expect(ids).toEqual(["browser-broker", "local-git", "project-local"]);
    for (const adapter of body.adapterHealth) {
      expect(["AVAILABLE", "UNAVAILABLE"]).toContain(adapter.status);
      expect(adapter.capabilityCount).toBeGreaterThan(0);
    }
  });

  test("the Browser Broker reports UNAVAILABLE until the operator opts in", async () => {
    const body = await (await request("/dashboard")).json();
    const broker = body.adapterHealth.find((a) => a.adapterId === "browser-broker");
    // Never AVAILABLE by default: attaching to a browser requires an explicit
    // opt-in, and claiming otherwise would be exactly the fake-healthy state
    // the projection exists to prevent.
    expect(broker.status).toBe("UNAVAILABLE");
    expect(broker.kind).toBe("BROWSER");
  });

  test("audit integrity is UNCHECKED until explicitly checked, then reported", async () => {
    const chief = new ChiefOfStaff(db);
    const task = await fixture.createTask({});
    await chief.delegate({
      taskId: task.id,
      toAgentKey: AGENT_KEYS.ENGINEERING,
      requestId: randomUUID(),
    });

    expect((await (await request("/dashboard")).json()).auditSummary.chainStatus).toBe(
      "UNCHECKED"
    );

    const check = await (
      await request("/audit-integrity/check", { method: "POST" })
    ).json();
    expect(check.integrity.valid).toBe(true);
    expect(check.summary.chainStatus).toBe("VALID");

    const after = (await (await request("/dashboard")).json()).auditSummary;
    expect(after.chainStatus).toBe("VALID");
    expect(after.lastSequence).toBeGreaterThan(0);
    expect(typeof after.lastCheckedAt).toBe("string");
  });

  test("a VALID audit verdict goes STALE once the chain grows past what was verified", async () => {
    // Regression (independent review): the cached verdict was paired with a
    // live lastSequence, so a VALID from sequence 10 kept describing a chain
    // that had since grown to any length — exactly the tampering window the
    // hash chain exists to reveal.
    const chief = new ChiefOfStaff(db);
    const task = await fixture.createTask({});
    await chief.delegate({
      taskId: task.id,
      toAgentKey: AGENT_KEYS.ENGINEERING,
      requestId: randomUUID(),
    });

    const checked = await (
      await request("/audit-integrity/check", { method: "POST" })
    ).json();
    expect(checked.summary.chainStatus).toBe("VALID");
    const verifiedThrough = checked.summary.verifiedThroughSequence;
    expect(verifiedThrough).toBeGreaterThan(0);

    // More governed activity extends the chain beyond the verified tip.
    const second = await fixture.createTask({ title: "second" });
    await chief.delegate({
      taskId: second.id,
      toAgentKey: AGENT_KEYS.ENGINEERING,
      requestId: randomUUID(),
    });

    const summary = (await (await request("/dashboard")).json()).auditSummary;
    expect(summary.chainStatus).toBe("STALE");
    expect(summary.lastSequence).toBeGreaterThan(verifiedThrough);
    expect(summary.verifiedThroughSequence).toBe(verifiedThrough);
  });

  test("pendingReconciliation counts every unverified external effect, not only UNKNOWN", async () => {
    // Regression: a crash between execution and verification leaves an intent
    // EXECUTED_UNVERIFIED with a SUCCEEDED/PENDING receipt. Counting only
    // UNKNOWN reported a clean system while a real effect was outstanding.
    const chief = new ChiefOfStaff(db);
    const runs = new AgentRunCoordinator(db);
    const task = await fixture.createTask({});
    const delegation = await chief.delegate({
      taskId: task.id,
      toAgentKey: AGENT_KEYS.ENGINEERING,
      requestId: randomUUID(),
    });
    await chief.markTaskRunning({ taskId: task.id });
    await runs.startRun({ runId: delegation.run.id, requestId: randomUUID() });

    const { IntentService } = require("../../../domain/yusufOS/actions/IntentService");
    const intent = await new IntentService(db).create(
      {
        principal: { type: "AGENT", id: fixture.engineering.uuid },
        agentId: fixture.engineering.id,
        taskId: task.id,
        runId: delegation.run.id,
        capability: "core.local_mutation",
        resource: { type: "TEST", id: "r1", version: "v1" },
        target: {},
        payload: {},
      },
      { requestId: randomUUID() }
    );
    await db.yusuf_action_intents.update({
      where: { id: intent.id },
      data: { status: "EXECUTED_UNVERIFIED" },
    });

    const body = await (await request("/dashboard")).json();
    expect(body.systemStatus.pendingReconciliation).toBe(1);
  });

  test("a handoff reason must be a controlled token, so agent prose cannot reach the operator's view", async () => {
    // Regression: `gate` was raw agent-authored text flowing straight into the
    // projection and the event stream.
    const { HandoffService } = require("../../../domain/yusufOS/handoffs/HandoffService");
    const task = await fixture.createTask({});
    await expect(
      new HandoffService(db).create({
        taskId: task.id,
        fromAgentId: fixture.chief.id,
        toAgentId: fixture.engineering.id,
        reason: "<img src=x onerror=alert(1)>",
        actingAgentId: fixture.chief.id,
        requestId: randomUUID(),
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(await db.yusuf_handoffs.count()).toBe(0);
  });

  test("a pending approval appears in the attention queue with safe target text", async () => {
    const chief = new ChiefOfStaff(db);
    const runs = new AgentRunCoordinator(db);
    const task = await fixture.createTask({});
    const delegation = await chief.delegate({
      taskId: task.id,
      toAgentKey: AGENT_KEYS.ENGINEERING,
      requestId: randomUUID(),
    });
    await chief.markTaskRunning({ taskId: task.id });
    await runs.startRun({ runId: delegation.run.id, requestId: randomUUID() });

    fixture.git.git(["checkout", "-b", "feature/gate-f"]);
    require("fs").writeFileSync(
      require("path").join(fixture.git.workRepo, "src", "calculator.js"),
      fixture.FIXED_CALCULATOR
    );
    fixture.git.git(["add", "."]);
    fixture.git.git(["commit", "-m", "gate f change"]);

    const {
      buildAgentToolset,
      invokeCapability,
    } = require("../../../domain/yusufOS/agents/toolBinding");
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.ENGINEERING, db });
    await invokeCapability({
      toolset,
      capabilityKey: "git.push_feature_branch",
      args: { repositoryId: fixture.repositoryUuid, branch: "feature/gate-f" },
      runtimeContext: {
        requestId: randomUUID(),
        principal: { type: "AGENT", id: fixture.engineering.uuid },
        agentId: fixture.engineering.id,
        taskId: task.id,
        runId: delegation.run.id,
      },
    });

    const body = await (await request("/dashboard")).json();
    expect(body.approvalAttentionQueue).toHaveLength(1);
    const entry = body.approvalAttentionQueue[0];
    expect(entry).toMatchObject({
      capabilityKey: "git.push_feature_branch",
      riskLevel: "L3",
    });
    expect(typeof entry.targetSummary).toBe("string");
    expect(typeof entry.expiresAt).toBe("string");

    // The waiting agent is surfaced as WAITING, not RUNNING or FAILED.
    const engineering = body.agentStatuses.find(
      (a) => a.agentId === AGENT_KEYS.ENGINEERING
    );
    expect(engineering.status).toBe("WAITING");
  });
});

describe("Gate F — event projection and realtime contract", () => {
  let testDatabase;
  let db;
  let fixture;

  beforeAll(async () => {
    testDatabase = await createTestDatabase();
    db = testDatabase.db;
  }, 120000);

  afterAll(async () => {
    if (testDatabase) await testDatabase.cleanup();
  });

  beforeEach(async () => {
    await clearYusufTables(db);
    fixture = await createAgentFixture({ db });
  });

  afterEach(() => {
    if (fixture) fixture.cleanup();
  });

  async function generateActivity() {
    const chief = new ChiefOfStaff(db);
    const task = await fixture.createTask({});
    await chief.delegate({
      taskId: task.id,
      toAgentKey: AGENT_KEYS.ENGINEERING,
      requestId: randomUUID(),
    });
    return task;
  }

  test("events carry a monotonic sequence and resume strictly after a cursor", async () => {
    await generateActivity();
    const projection = new EventProjection(db);

    const first = await projection.since(0, 100);
    expect(first.reset).toBe(false);
    expect(first.events.length).toBeGreaterThan(0);
    const sequences = first.events.map((e) => e.sequence);
    expect([...sequences].sort((a, b) => a - b)).toEqual(sequences);

    const resumed = await projection.since(first.cursor, 100);
    expect(resumed.events).toEqual([]);
    expect(resumed.cursor).toBe(first.cursor);
  });

  test("envelopes match the Gate B realtime contract shape", async () => {
    await generateActivity();
    const { events } = await new EventProjection(db).since(0, 100);
    const delegated = events.find((e) => e.type === "task.delegated");
    expect(delegated).toBeDefined();
    expect(delegated).toMatchObject({
      schemaVersion: 1,
      aggregateType: "task",
    });
    expect(typeof delegated.id).toBe("string");
    expect(typeof delegated.occurredAt).toBe("string");
    expect(typeof delegated.aggregateId).toBe("string");
    expect(delegated.data).toBeDefined();
  });

  test("event aggregateIds are the same public uuids the dashboard exposes", async () => {
    // Regression: audit rows reference tasks/runs by internal numeric id. If
    // the stream emitted those, a client could not join a live event to the
    // dashboard entity it updates — the two surfaces would be unjoinable.
    const task = await generateActivity();
    const { events } = await new EventProjection(db).since(0, 100);

    const taskEvent = events.find((e) => e.aggregateType === "task");
    expect(taskEvent.aggregateId).toBe(task.uuid);
    expect(taskEvent.aggregateId).not.toMatch(/^\d+$/);

    const runEvent = events.find((e) => e.aggregateType === "run");
    const run = await db.yusuf_agent_runs.findFirst({ where: { taskId: task.id } });
    expect(runEvent.aggregateId).toBe(run.uuid);

    // And the dashboard reports the identical identifiers.
    const dashboard = await new DashboardProjection(db).build();
    expect(dashboard.taskStatuses.map((t) => t.taskId)).toContain(
      taskEvent.aggregateId
    );
  });

  test("an event whose referenced entity no longer resolves is dropped, not emitted with a raw id", async () => {
    const { AuditService } = require("../../../domain/yusufOS/audit/AuditService");
    await new AuditService(db).append({
      eventType: "task.completed",
      principal: { type: "SYSTEM", id: "test" },
      taskRef: 999999, // never existed
      outcome: "COMPLETED",
      metadata: {},
      requestId: randomUUID(),
    });
    const { events } = await new EventProjection(db).since(0, 200);
    expect(events.some((e) => e.aggregateId === "999999")).toBe(false);
  });

  test("a cursor ahead of the chain asks the client to reload rather than guessing", async () => {
    await generateActivity();
    const projection = new EventProjection(db);
    const reset = await projection.since(999999, 100);
    expect(reset).toMatchObject({ reset: true, reason: "CURSOR_AHEAD_OF_CHAIN" });
    expect(reset.events).toEqual([]);
  });

  test("a cursor older than retained history triggers a reset", async () => {
    await generateActivity();
    // Simulate retention trimming: drop the earliest events so the requested
    // position no longer exists in the chain.
    const all = await db.yusuf_audit_events.findMany({ orderBy: { sequence: "asc" } });
    await db.yusuf_audit_events.deleteMany({
      where: { sequence: { lte: all[Math.min(2, all.length - 1)].sequence } },
    });
    const reset = await new EventProjection(db).since(1, 100);
    expect(reset).toMatchObject({ reset: true, reason: "RETENTION_GAP" });
  });

  test("only whitelisted metadata reaches a client, and secrets never do", async () => {
    const { AuditService } = require("../../../domain/yusufOS/audit/AuditService");
    await new AuditService(db).append({
      eventType: "task.delegated",
      principal: { type: "SYSTEM", id: "test" },
      taskRef: "task-uuid",
      outcome: "engineering",
      metadata: {
        reason: "DELEGATED_FOR_IMPLEMENTATION",
        // Neither of these is on the forward list; they must not appear.
        internalPath: "C:/Users/Yusuf/secret/location",
        authorization: "Bearer super-secret-value",
      },
      requestId: randomUUID(),
    });

    const { events } = await new EventProjection(db).since(0, 100);
    const projected = events.find((e) => e.aggregateId === "task-uuid");
    expect(projected.data.reason).toBe("DELEGATED_FOR_IMPLEMENTATION");
    expect(projected.data.internalPath).toBeUndefined();
    expect(projected.data.authorization).toBeUndefined();
    expect(JSON.stringify(projected)).not.toContain("super-secret-value");
    expect(JSON.stringify(projected)).not.toContain("secret/location");
  });

  test("the forwardable metadata list is a deny-by-default allowlist", () => {
    for (const key of FORWARDABLE_METADATA_KEYS) {
      expect(key).not.toMatch(/token|secret|password|key|credential|authorization/i);
    }
  });

  test("an unmapped audit event is dropped but still advances the cursor", async () => {
    const { AuditService } = require("../../../domain/yusufOS/audit/AuditService");
    await new AuditService(db).append({
      eventType: "some.future.event",
      principal: { type: "SYSTEM", id: "test" },
      outcome: "OK",
      metadata: {},
      requestId: randomUUID(),
    });
    const batch = await new EventProjection(db).since(0, 100);
    expect(batch.events.some((e) => e.type === "some.future.event")).toBe(false);
    // Cursor advanced past it, so it is not re-fetched forever.
    expect(Number(batch.cursor)).toBeGreaterThan(0);
    const next = await new EventProjection(db).since(batch.cursor, 100);
    expect(next.events).toEqual([]);
  });

  test("a negative or non-integer cursor is rejected", async () => {
    const projection = new EventProjection(db);
    await expect(projection.since(-1, 10)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    await expect(projection.since("not-a-number", 10)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  test("the event projection cannot write to the audit chain", async () => {
    await generateActivity();
    const before = await db.yusuf_audit_events.count();
    await new EventProjection(db).since(0, 100);
    await new EventProjection(db).since(0, 100);
    expect(await db.yusuf_audit_events.count()).toBe(before);
  });
});
