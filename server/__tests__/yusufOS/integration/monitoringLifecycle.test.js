const { randomUUID } = require("crypto");
const {
  createTestDatabase,
  clearYusufTables,
} = require("../../../__testUtils__/yusufOS/testDatabase");
const {
  createAgentFixture,
} = require("../../../__testUtils__/yusufOS/agentFixture");
const {
  buildAgentToolset,
  invokeCapability,
} = require("../../../domain/yusufOS/agents/toolBinding");
const {
  AGENT_KEYS,
  MONITORING_CHECK_KEYS,
} = require("../../../domain/yusufOS/constants");

describe("Phase K — Monitoring governed lifecycle", () => {
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

  async function seedRun(agent, task) {
    const requestId = randomUUID();
    const run = await db.yusuf_agent_runs.create({
      data: {
        uuid: randomUUID(),
        taskId: task.id,
        agentId: agent.id,
        requestedByPrincipalType: "AGENT",
        requestedByPrincipalId: agent.uuid,
        status: "RUNNING",
        requestId,
      },
    });
    return {
      run,
      context: {
        requestId,
        principal: { type: "AGENT", id: agent.uuid },
        agentId: agent.id,
        taskId: task.id,
        runId: run.id,
      },
    };
  }

  async function makeTask(agent) {
    return fixture.createTask({ principal: { type: "AGENT", id: agent.uuid } });
  }

  test("Monitoring reads its own health snapshot", async () => {
    const task = await makeTask(fixture.monitoring);
    const { context } = await seedRun(fixture.monitoring, task);
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.MONITORING, db });
    const receipt = await invokeCapability({
      toolset,
      capabilityKey: "system.read_health",
      args: {},
      runtimeContext: context,
    });
    const result = JSON.parse(receipt.sanitizedResult);
    expect(result.pendingApprovals).toBe(0);
    expect(result.unresolvedIntents).toBe(0);
    expect(result.controlPlaneHealthy).toBe(true);
    expect(result.killSwitchEngaged).toBe(false);
  });

  test("a clean system records an OK check", async () => {
    const task = await makeTask(fixture.monitoring);
    const { context } = await seedRun(fixture.monitoring, task);
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.MONITORING, db });
    const receipt = await invokeCapability({
      toolset,
      capabilityKey: "monitoring.record_check",
      args: { checkKey: MONITORING_CHECK_KEYS.SYSTEM_HEALTH },
      runtimeContext: context,
    });
    expect(receipt.verificationStatus).toBe("VERIFIED");
    const result = JSON.parse(receipt.sanitizedResult);
    expect(result.status).toBe("OK");
    const row = await db.yusuf_monitoring_checks.findUnique({
      where: { uuid: result.uuid },
    });
    expect(row.checkKey).toBe("SYSTEM_HEALTH");
    expect(row.status).toBe("OK");
  });

  test("a model cannot force a BREACH verdict by lying in its arguments", async () => {
    const task = await makeTask(fixture.monitoring);
    const { context } = await seedRun(fixture.monitoring, task);
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.MONITORING, db });
    // Extra, unexpected fields on the call are simply ignored: the adapter
    // never reads a caller-supplied status/observedValue at all.
    const receipt = await invokeCapability({
      toolset,
      capabilityKey: "monitoring.record_check",
      args: {
        checkKey: MONITORING_CHECK_KEYS.SYSTEM_HEALTH,
        status: "BREACH",
        observedValue: { pendingApprovals: 9999 },
      },
      runtimeContext: context,
    });
    const result = JSON.parse(receipt.sanitizedResult);
    expect(result.status).toBe("OK");
  });

  test("an unregistered checkKey is rejected before any row is written", async () => {
    const task = await makeTask(fixture.monitoring);
    const { context } = await seedRun(fixture.monitoring, task);
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.MONITORING, db });
    await expect(
      invokeCapability({
        toolset,
        capabilityKey: "monitoring.record_check",
        args: { checkKey: "NOT_REAL" },
        runtimeContext: context,
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(await db.yusuf_monitoring_checks.count()).toBe(0);
  });

  test("a real WARN condition is recorded and Monitoring can file a Knowledge finding about it", async () => {
    // Manufacture one real unresolved intent (>= the WARN threshold of 1)
    // against the fixture's own task/run rows — this proves the adapter
    // reads real Prisma state, not a fixture shortcut.
    const task = await makeTask(fixture.engineering);
    const { run } = await seedRun(fixture.engineering, task);
    await db.yusuf_action_intents.create({
      data: {
        uuid: randomUUID(),
        taskId: task.id,
        runId: run.id,
        requestedByPrincipalType: "AGENT",
        requestedByPrincipalId: fixture.engineering.uuid,
        capabilityKey: "core.external_mutation",
        capabilityVersion: 1,
        resourceType: "TEST",
        resourceId: "res-1",
        environment: "LOCAL",
        canonicalTarget: "{}",
        canonicalPayload: "{}",
        canonicalPreconditions: "{}",
        targetIdentityDigest: "test-digest",
        payloadHash: "test-payload-hash",
        intentFingerprint: randomUUID(),
        canonicalizationVersion: 1,
        status: "EXECUTING",
        requestId: randomUUID(),
      },
    });

    const monitoringTask = await makeTask(fixture.monitoring);
    const { context } = await seedRun(fixture.monitoring, monitoringTask);
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.MONITORING, db });
    const checkReceipt = await invokeCapability({
      toolset,
      capabilityKey: "monitoring.record_check",
      args: { checkKey: MONITORING_CHECK_KEYS.SYSTEM_HEALTH },
      runtimeContext: context,
    });
    const checkResult = JSON.parse(checkReceipt.sanitizedResult);
    expect(checkResult.status).toBe("WARN");

    const { context: findingContext } = await seedRun(
      fixture.monitoring,
      monitoringTask
    );
    const findingReceipt = await invokeCapability({
      toolset,
      capabilityKey: "knowledge.write",
      args: {
        title: "Approval backlog WARN",
        body: checkResult.summary,
        sourceType: "AGENT_DERIVED",
        tags: ["monitoring", "system_health"],
      },
      runtimeContext: findingContext,
    });
    expect(findingReceipt.verificationStatus).toBe("VERIFIED");
    expect(await db.yusuf_knowledge_entries.count()).toBe(1);
  });

  test("a stuck monitoring.record_check intent from a prior call is not hidden from a later check", async () => {
    // Independent review caught this: excluding the whole monitoring.record_check
    // capability from unresolvedIntents (rather than only the exact in-flight
    // intent computing the current snapshot) would let a genuinely stuck write
    // — the exact class of effect this signal exists to surface — go invisible
    // forever. A *previous* call's stuck intent must still count.
    const task = await makeTask(fixture.engineering);
    const { run } = await seedRun(fixture.engineering, task);
    await db.yusuf_action_intents.create({
      data: {
        uuid: randomUUID(),
        taskId: task.id,
        runId: run.id,
        requestedByPrincipalType: "AGENT",
        requestedByPrincipalId: fixture.monitoring.uuid,
        capabilityKey: "monitoring.record_check",
        capabilityVersion: 1,
        resourceType: "MONITORING_CHECK",
        resourceId: randomUUID(),
        environment: "LOCAL",
        canonicalTarget: "{}",
        canonicalPayload: "{}",
        canonicalPreconditions: "{}",
        targetIdentityDigest: "test-digest",
        payloadHash: "test-payload-hash",
        intentFingerprint: randomUUID(),
        canonicalizationVersion: 1,
        status: "FAILED_UNKNOWN",
        requestId: randomUUID(),
      },
    });

    const monitoringTask = await makeTask(fixture.monitoring);
    const { context } = await seedRun(fixture.monitoring, monitoringTask);
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.MONITORING, db });
    const receipt = await invokeCapability({
      toolset,
      capabilityKey: "monitoring.record_check",
      args: { checkKey: MONITORING_CHECK_KEYS.SYSTEM_HEALTH },
      runtimeContext: context,
    });
    const result = JSON.parse(receipt.sanitizedResult);
    expect(result.status).toBe("WARN");
    expect(result.summary).toMatch(/unresolved intent/);
  });

  test("Monitoring has no project, git, browser, or memory.write tool", async () => {
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.MONITORING, db });
    for (const key of Object.keys(toolset.tools))
      expect(key.match(/^(project\.|git\.|browser\.|memory\.write)/)).toBeNull();
  });

  test("recording two checks in a row produces two history rows, not an upsert", async () => {
    const task = await makeTask(fixture.monitoring);
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.MONITORING, db });
    const { context: c1 } = await seedRun(fixture.monitoring, task);
    await invokeCapability({
      toolset,
      capabilityKey: "monitoring.record_check",
      args: { checkKey: MONITORING_CHECK_KEYS.SYSTEM_HEALTH },
      runtimeContext: c1,
    });
    const { context: c2 } = await seedRun(fixture.monitoring, task);
    await invokeCapability({
      toolset,
      capabilityKey: "monitoring.record_check",
      args: { checkKey: MONITORING_CHECK_KEYS.SYSTEM_HEALTH },
      runtimeContext: c2,
    });
    expect(await db.yusuf_monitoring_checks.count()).toBe(2);
  });
});
