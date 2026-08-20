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
const { AGENT_KEYS } = require("../../../domain/yusufOS/constants");

describe("Phase N — Founder governed lifecycle", () => {
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

  test("recording a new venture always starts at IDEA, even if the model asks for something else", async () => {
    const task = await makeTask(fixture.founder);
    const { context } = await seedRun(fixture.founder, task);
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.FOUNDER, db });
    const receipt = await invokeCapability({
      toolset,
      capabilityKey: "founder.record_venture",
      args: { name: "CareerGuide AI", category: "SaaS", status: "LAUNCHED" },
      runtimeContext: context,
    });
    expect(receipt.verificationStatus).toBe("VERIFIED");
    const result = JSON.parse(receipt.sanitizedResult);
    expect(result.status).toBe("IDEA");
    const row = await db.yusuf_founder_ventures.findUnique({
      where: { uuid: result.uuid },
    });
    expect(row.name).toBe("CareerGuide AI");
    expect(row.status).toBe("IDEA");
  });

  test("a valid forward transition (IDEA -> VALIDATING) succeeds and updates notes", async () => {
    const task = await makeTask(fixture.founder);
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.FOUNDER, db });
    const { context: createContext } = await seedRun(fixture.founder, task);
    const created = await invokeCapability({
      toolset,
      capabilityKey: "founder.record_venture",
      args: { name: "CareerGuide AI", category: "SaaS" },
      runtimeContext: createContext,
    });
    const { uuid } = JSON.parse(created.sanitizedResult);

    const { context: updateContext } = await seedRun(fixture.founder, task);
    const updated = await invokeCapability({
      toolset,
      capabilityKey: "founder.update_status",
      args: { uuid, status: "VALIDATING", notes: "Talking to potential users" },
      runtimeContext: updateContext,
    });
    expect(updated.verificationStatus).toBe("VERIFIED");
    const row = await db.yusuf_founder_ventures.findUnique({ where: { uuid } });
    expect(row.status).toBe("VALIDATING");
    expect(row.notes).toBe("Talking to potential users");
  });

  test("the resume backward edge (PAUSED -> BUILDING) succeeds", async () => {
    const task = await makeTask(fixture.founder);
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.FOUNDER, db });
    const { context: c1 } = await seedRun(fixture.founder, task);
    const created = await invokeCapability({
      toolset,
      capabilityKey: "founder.record_venture",
      args: { name: "CareerGuide AI", category: "SaaS" },
      runtimeContext: c1,
    });
    const { uuid } = JSON.parse(created.sanitizedResult);
    for (const status of ["VALIDATING", "BUILDING", "PAUSED"]) {
      const { context } = await seedRun(fixture.founder, task);
      await invokeCapability({
        toolset,
        capabilityKey: "founder.update_status",
        args: { uuid, status },
        runtimeContext: context,
      });
    }
    const { context: resumeContext } = await seedRun(fixture.founder, task);
    const resumed = await invokeCapability({
      toolset,
      capabilityKey: "founder.update_status",
      args: { uuid, status: "BUILDING", notes: "Back to it" },
      runtimeContext: resumeContext,
    });
    expect(resumed.verificationStatus).toBe("VERIFIED");
    const row = await db.yusuf_founder_ventures.findUnique({ where: { uuid } });
    expect(row.status).toBe("BUILDING");
    expect(row.notes).toBe("Back to it");
  });

  test("an illegal transition (IDEA -> LAUNCHED) is rejected before any write", async () => {
    const task = await makeTask(fixture.founder);
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.FOUNDER, db });
    const { context: createContext } = await seedRun(fixture.founder, task);
    const created = await invokeCapability({
      toolset,
      capabilityKey: "founder.record_venture",
      args: { name: "CareerGuide AI", category: "SaaS" },
      runtimeContext: createContext,
    });
    const { uuid, digest } = JSON.parse(created.sanitizedResult);

    const { context: updateContext } = await seedRun(fixture.founder, task);
    await expect(
      invokeCapability({
        toolset,
        capabilityKey: "founder.update_status",
        args: { uuid, status: "LAUNCHED" },
        runtimeContext: updateContext,
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const row = await db.yusuf_founder_ventures.findUnique({ where: { uuid } });
    expect(row.status).toBe("IDEA");
    expect(row.digest).toBe(digest);
  });

  test("a terminal venture (KILLED) refuses any further transition", async () => {
    const task = await makeTask(fixture.founder);
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.FOUNDER, db });
    const { context: c1 } = await seedRun(fixture.founder, task);
    const created = await invokeCapability({
      toolset,
      capabilityKey: "founder.record_venture",
      args: { name: "CareerGuide AI", category: "SaaS" },
      runtimeContext: c1,
    });
    const { uuid } = JSON.parse(created.sanitizedResult);

    const { context: c2 } = await seedRun(fixture.founder, task);
    await invokeCapability({
      toolset,
      capabilityKey: "founder.update_status",
      args: { uuid, status: "KILLED" },
      runtimeContext: c2,
    });

    const { context: c3 } = await seedRun(fixture.founder, task);
    await expect(
      invokeCapability({
        toolset,
        capabilityKey: "founder.update_status",
        args: { uuid, status: "VALIDATING" },
        runtimeContext: c3,
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  test("an unknown venture uuid is rejected before any write", async () => {
    const task = await makeTask(fixture.founder);
    const { context } = await seedRun(fixture.founder, task);
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.FOUNDER, db });
    await expect(
      invokeCapability({
        toolset,
        capabilityKey: "founder.update_status",
        args: { uuid: randomUUID(), status: "VALIDATING" },
        runtimeContext: context,
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(await db.yusuf_founder_ventures.count()).toBe(0);
  });

  test("reading by status filters correctly and reading by uuid returns one row", async () => {
    const task = await makeTask(fixture.founder);
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.FOUNDER, db });
    const { context: c1 } = await seedRun(fixture.founder, task);
    const created = await invokeCapability({
      toolset,
      capabilityKey: "founder.record_venture",
      args: { name: "CareerGuide AI", category: "SaaS" },
      runtimeContext: c1,
    });
    const { uuid } = JSON.parse(created.sanitizedResult);
    const { context: c2 } = await seedRun(fixture.founder, task);
    await invokeCapability({
      toolset,
      capabilityKey: "founder.record_venture",
      args: { name: "HireLens AI", category: "SaaS" },
      runtimeContext: c2,
    });

    const { context: readContext } = await seedRun(fixture.founder, task);
    const byStatus = await invokeCapability({
      toolset,
      capabilityKey: "founder.read_ventures",
      args: { status: "IDEA" },
      runtimeContext: readContext,
    });
    expect(JSON.parse(byStatus.sanitizedResult).items).toHaveLength(2);

    const { context: readOneContext } = await seedRun(fixture.founder, task);
    const byUuid = await invokeCapability({
      toolset,
      capabilityKey: "founder.read_ventures",
      args: { uuid },
      runtimeContext: readOneContext,
    });
    expect(JSON.parse(byUuid.sanitizedResult).uuid).toBe(uuid);
  });

  test("Founder has no project, git, browser, or memory-write tool", async () => {
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.FOUNDER, db });
    for (const key of Object.keys(toolset.tools))
      expect(key.match(/^(project\.|git\.|browser\.|memory\.write)/)).toBeNull();
  });

  test("re-recording the same name/category produces a second distinct row, not an upsert", async () => {
    const task = await makeTask(fixture.founder);
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.FOUNDER, db });
    const { context: c1 } = await seedRun(fixture.founder, task);
    await invokeCapability({
      toolset,
      capabilityKey: "founder.record_venture",
      args: { name: "CareerGuide AI", category: "SaaS" },
      runtimeContext: c1,
    });
    const { context: c2 } = await seedRun(fixture.founder, task);
    await invokeCapability({
      toolset,
      capabilityKey: "founder.record_venture",
      args: { name: "CareerGuide AI", category: "SaaS" },
      runtimeContext: c2,
    });
    expect(await db.yusuf_founder_ventures.count()).toBe(2);
  });
});
