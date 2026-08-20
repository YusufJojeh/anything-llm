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

describe("Phase L — Career governed lifecycle", () => {
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

  test("recording a new opportunity always starts at RESEARCHING, even if the model asks for something else", async () => {
    const task = await makeTask(fixture.career);
    const { context } = await seedRun(fixture.career, task);
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.CAREER, db });
    const receipt = await invokeCapability({
      toolset,
      capabilityKey: "career.record_opportunity",
      args: {
        company: "Acme Corp",
        role: "Backend Engineer",
        source: "referral",
        status: "OFFER",
      },
      runtimeContext: context,
    });
    expect(receipt.verificationStatus).toBe("VERIFIED");
    const result = JSON.parse(receipt.sanitizedResult);
    expect(result.status).toBe("RESEARCHING");
    const row = await db.yusuf_career_opportunities.findUnique({
      where: { uuid: result.uuid },
    });
    expect(row.company).toBe("Acme Corp");
    expect(row.status).toBe("RESEARCHING");
  });

  test("a valid transition (RESEARCHING -> APPLIED) succeeds and updates notes", async () => {
    const task = await makeTask(fixture.career);
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.CAREER, db });
    const { context: createContext } = await seedRun(fixture.career, task);
    const created = await invokeCapability({
      toolset,
      capabilityKey: "career.record_opportunity",
      args: { company: "Acme Corp", role: "Backend Engineer" },
      runtimeContext: createContext,
    });
    const { uuid } = JSON.parse(created.sanitizedResult);

    const { context: updateContext } = await seedRun(fixture.career, task);
    const updated = await invokeCapability({
      toolset,
      capabilityKey: "career.update_status",
      args: { uuid, status: "APPLIED", notes: "Applied via referral" },
      runtimeContext: updateContext,
    });
    expect(updated.verificationStatus).toBe("VERIFIED");
    const row = await db.yusuf_career_opportunities.findUnique({
      where: { uuid },
    });
    expect(row.status).toBe("APPLIED");
    expect(row.notes).toBe("Applied via referral");
  });

  test("an illegal transition (RESEARCHING -> OFFER) is rejected before any write", async () => {
    const task = await makeTask(fixture.career);
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.CAREER, db });
    const { context: createContext } = await seedRun(fixture.career, task);
    const created = await invokeCapability({
      toolset,
      capabilityKey: "career.record_opportunity",
      args: { company: "Acme Corp", role: "Backend Engineer" },
      runtimeContext: createContext,
    });
    const { uuid, digest } = JSON.parse(created.sanitizedResult);

    const { context: updateContext } = await seedRun(fixture.career, task);
    await expect(
      invokeCapability({
        toolset,
        capabilityKey: "career.update_status",
        args: { uuid, status: "OFFER" },
        runtimeContext: updateContext,
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const row = await db.yusuf_career_opportunities.findUnique({
      where: { uuid },
    });
    expect(row.status).toBe("RESEARCHING");
    expect(row.digest).toBe(digest);
  });

  test("a terminal opportunity (REJECTED) refuses any further transition", async () => {
    const task = await makeTask(fixture.career);
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.CAREER, db });
    const { context: c1 } = await seedRun(fixture.career, task);
    const created = await invokeCapability({
      toolset,
      capabilityKey: "career.record_opportunity",
      args: { company: "Acme Corp", role: "Backend Engineer" },
      runtimeContext: c1,
    });
    const { uuid } = JSON.parse(created.sanitizedResult);

    const { context: c2 } = await seedRun(fixture.career, task);
    await invokeCapability({
      toolset,
      capabilityKey: "career.update_status",
      args: { uuid, status: "APPLIED" },
      runtimeContext: c2,
    });
    const { context: c3 } = await seedRun(fixture.career, task);
    await invokeCapability({
      toolset,
      capabilityKey: "career.update_status",
      args: { uuid, status: "REJECTED" },
      runtimeContext: c3,
    });

    const { context: c4 } = await seedRun(fixture.career, task);
    await expect(
      invokeCapability({
        toolset,
        capabilityKey: "career.update_status",
        args: { uuid, status: "APPLIED" },
        runtimeContext: c4,
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  test("an unknown opportunity uuid is rejected before any write", async () => {
    const task = await makeTask(fixture.career);
    const { context } = await seedRun(fixture.career, task);
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.CAREER, db });
    await expect(
      invokeCapability({
        toolset,
        capabilityKey: "career.update_status",
        args: { uuid: randomUUID(), status: "APPLIED" },
        runtimeContext: context,
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(await db.yusuf_career_opportunities.count()).toBe(0);
  });

  test("reading by status filters correctly and reading by uuid returns one row", async () => {
    const task = await makeTask(fixture.career);
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.CAREER, db });
    const { context: c1 } = await seedRun(fixture.career, task);
    const created = await invokeCapability({
      toolset,
      capabilityKey: "career.record_opportunity",
      args: { company: "Acme Corp", role: "Backend Engineer" },
      runtimeContext: c1,
    });
    const { uuid } = JSON.parse(created.sanitizedResult);
    const { context: c2 } = await seedRun(fixture.career, task);
    await invokeCapability({
      toolset,
      capabilityKey: "career.record_opportunity",
      args: { company: "Globex", role: "SRE" },
      runtimeContext: c2,
    });

    const { context: readContext } = await seedRun(fixture.career, task);
    const byStatus = await invokeCapability({
      toolset,
      capabilityKey: "career.read_opportunities",
      args: { status: "RESEARCHING" },
      runtimeContext: readContext,
    });
    expect(JSON.parse(byStatus.sanitizedResult).opportunities).toHaveLength(2);

    const { context: readOneContext } = await seedRun(fixture.career, task);
    const byUuid = await invokeCapability({
      toolset,
      capabilityKey: "career.read_opportunities",
      args: { uuid },
      runtimeContext: readOneContext,
    });
    expect(JSON.parse(byUuid.sanitizedResult).uuid).toBe(uuid);
  });

  test("Career has no project, git, browser, or memory-write tool", async () => {
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.CAREER, db });
    for (const key of Object.keys(toolset.tools))
      expect(key.match(/^(project\.|git\.|browser\.|memory\.write)/)).toBeNull();
  });

  test("re-recording the same company/role produces a second distinct row, not an upsert", async () => {
    const task = await makeTask(fixture.career);
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.CAREER, db });
    const { context: c1 } = await seedRun(fixture.career, task);
    await invokeCapability({
      toolset,
      capabilityKey: "career.record_opportunity",
      args: { company: "Acme Corp", role: "Backend Engineer" },
      runtimeContext: c1,
    });
    const { context: c2 } = await seedRun(fixture.career, task);
    await invokeCapability({
      toolset,
      capabilityKey: "career.record_opportunity",
      args: { company: "Acme Corp", role: "Backend Engineer" },
      runtimeContext: c2,
    });
    expect(await db.yusuf_career_opportunities.count()).toBe(2);
  });
});
