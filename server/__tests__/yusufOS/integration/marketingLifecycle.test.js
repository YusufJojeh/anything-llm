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

describe("Phase M — Marketing governed lifecycle", () => {
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

  test("recording new content always starts at IDEA, even if the model asks for something else", async () => {
    const task = await makeTask(fixture.marketing);
    const { context } = await seedRun(fixture.marketing, task);
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.MARKETING, db });
    const receipt = await invokeCapability({
      toolset,
      capabilityKey: "marketing.record_content",
      args: {
        title: "Launch announcement",
        channel: "twitter",
        format: "thread",
        status: "PUBLISHED",
      },
      runtimeContext: context,
    });
    expect(receipt.verificationStatus).toBe("VERIFIED");
    const result = JSON.parse(receipt.sanitizedResult);
    expect(result.status).toBe("IDEA");
    const row = await db.yusuf_marketing_content.findUnique({
      where: { uuid: result.uuid },
    });
    expect(row.title).toBe("Launch announcement");
    expect(row.status).toBe("IDEA");
  });

  test("a valid forward transition (IDEA -> DRAFTING) succeeds and updates notes", async () => {
    const task = await makeTask(fixture.marketing);
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.MARKETING, db });
    const { context: createContext } = await seedRun(fixture.marketing, task);
    const created = await invokeCapability({
      toolset,
      capabilityKey: "marketing.record_content",
      args: { title: "Launch announcement", channel: "twitter", format: "thread" },
      runtimeContext: createContext,
    });
    const { uuid } = JSON.parse(created.sanitizedResult);

    const { context: updateContext } = await seedRun(fixture.marketing, task);
    const updated = await invokeCapability({
      toolset,
      capabilityKey: "marketing.update_status",
      args: { uuid, status: "DRAFTING", notes: "Started outline" },
      runtimeContext: updateContext,
    });
    expect(updated.verificationStatus).toBe("VERIFIED");
    const row = await db.yusuf_marketing_content.findUnique({ where: { uuid } });
    expect(row.status).toBe("DRAFTING");
    expect(row.notes).toBe("Started outline");
  });

  test("the backward revision edge (READY_FOR_REVIEW -> DRAFTING) succeeds", async () => {
    const task = await makeTask(fixture.marketing);
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.MARKETING, db });
    const { context: c1 } = await seedRun(fixture.marketing, task);
    const created = await invokeCapability({
      toolset,
      capabilityKey: "marketing.record_content",
      args: { title: "Launch announcement", channel: "twitter", format: "thread" },
      runtimeContext: c1,
    });
    const { uuid } = JSON.parse(created.sanitizedResult);
    const { context: c2 } = await seedRun(fixture.marketing, task);
    await invokeCapability({
      toolset,
      capabilityKey: "marketing.update_status",
      args: { uuid, status: "DRAFTING" },
      runtimeContext: c2,
    });
    const { context: c3 } = await seedRun(fixture.marketing, task);
    await invokeCapability({
      toolset,
      capabilityKey: "marketing.update_status",
      args: { uuid, status: "READY_FOR_REVIEW" },
      runtimeContext: c3,
    });
    const { context: c4 } = await seedRun(fixture.marketing, task);
    const sentBack = await invokeCapability({
      toolset,
      capabilityKey: "marketing.update_status",
      args: { uuid, status: "DRAFTING", notes: "Needs another pass" },
      runtimeContext: c4,
    });
    expect(sentBack.verificationStatus).toBe("VERIFIED");
    const row = await db.yusuf_marketing_content.findUnique({ where: { uuid } });
    expect(row.status).toBe("DRAFTING");
    expect(row.notes).toBe("Needs another pass");
  });

  test("the backward pull-back edge (SCHEDULED -> DRAFTING) succeeds", async () => {
    const task = await makeTask(fixture.marketing);
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.MARKETING, db });
    const { context: c1 } = await seedRun(fixture.marketing, task);
    const created = await invokeCapability({
      toolset,
      capabilityKey: "marketing.record_content",
      args: { title: "Launch announcement", channel: "twitter", format: "thread" },
      runtimeContext: c1,
    });
    const { uuid } = JSON.parse(created.sanitizedResult);
    for (const status of ["DRAFTING", "READY_FOR_REVIEW", "SCHEDULED"]) {
      const { context } = await seedRun(fixture.marketing, task);
      await invokeCapability({
        toolset,
        capabilityKey: "marketing.update_status",
        args: { uuid, status },
        runtimeContext: context,
      });
    }
    const { context: pullBackContext } = await seedRun(fixture.marketing, task);
    const pulled = await invokeCapability({
      toolset,
      capabilityKey: "marketing.update_status",
      args: { uuid, status: "DRAFTING" },
      runtimeContext: pullBackContext,
    });
    expect(pulled.verificationStatus).toBe("VERIFIED");
    const row = await db.yusuf_marketing_content.findUnique({ where: { uuid } });
    expect(row.status).toBe("DRAFTING");
  });

  test("an illegal transition (IDEA -> PUBLISHED) is rejected before any write", async () => {
    const task = await makeTask(fixture.marketing);
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.MARKETING, db });
    const { context: createContext } = await seedRun(fixture.marketing, task);
    const created = await invokeCapability({
      toolset,
      capabilityKey: "marketing.record_content",
      args: { title: "Launch announcement", channel: "twitter", format: "thread" },
      runtimeContext: createContext,
    });
    const { uuid, digest } = JSON.parse(created.sanitizedResult);

    const { context: updateContext } = await seedRun(fixture.marketing, task);
    await expect(
      invokeCapability({
        toolset,
        capabilityKey: "marketing.update_status",
        args: { uuid, status: "PUBLISHED" },
        runtimeContext: updateContext,
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const row = await db.yusuf_marketing_content.findUnique({ where: { uuid } });
    expect(row.status).toBe("IDEA");
    expect(row.digest).toBe(digest);
  });

  test("a terminal content item (ARCHIVED) refuses any further transition", async () => {
    const task = await makeTask(fixture.marketing);
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.MARKETING, db });
    const { context: c1 } = await seedRun(fixture.marketing, task);
    const created = await invokeCapability({
      toolset,
      capabilityKey: "marketing.record_content",
      args: { title: "Launch announcement", channel: "twitter", format: "thread" },
      runtimeContext: c1,
    });
    const { uuid } = JSON.parse(created.sanitizedResult);

    const { context: c2 } = await seedRun(fixture.marketing, task);
    await invokeCapability({
      toolset,
      capabilityKey: "marketing.update_status",
      args: { uuid, status: "ARCHIVED" },
      runtimeContext: c2,
    });

    const { context: c3 } = await seedRun(fixture.marketing, task);
    await expect(
      invokeCapability({
        toolset,
        capabilityKey: "marketing.update_status",
        args: { uuid, status: "DRAFTING" },
        runtimeContext: c3,
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  test("an unknown content uuid is rejected before any write", async () => {
    const task = await makeTask(fixture.marketing);
    const { context } = await seedRun(fixture.marketing, task);
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.MARKETING, db });
    await expect(
      invokeCapability({
        toolset,
        capabilityKey: "marketing.update_status",
        args: { uuid: randomUUID(), status: "DRAFTING" },
        runtimeContext: context,
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(await db.yusuf_marketing_content.count()).toBe(0);
  });

  test("reading by status filters correctly and reading by uuid returns one row", async () => {
    const task = await makeTask(fixture.marketing);
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.MARKETING, db });
    const { context: c1 } = await seedRun(fixture.marketing, task);
    const created = await invokeCapability({
      toolset,
      capabilityKey: "marketing.record_content",
      args: { title: "Launch announcement", channel: "twitter", format: "thread" },
      runtimeContext: c1,
    });
    const { uuid } = JSON.parse(created.sanitizedResult);
    const { context: c2 } = await seedRun(fixture.marketing, task);
    await invokeCapability({
      toolset,
      capabilityKey: "marketing.record_content",
      args: { title: "Blog post", channel: "blog", format: "long-form" },
      runtimeContext: c2,
    });

    const { context: readContext } = await seedRun(fixture.marketing, task);
    const byStatus = await invokeCapability({
      toolset,
      capabilityKey: "marketing.read_content",
      args: { status: "IDEA" },
      runtimeContext: readContext,
    });
    expect(JSON.parse(byStatus.sanitizedResult).items).toHaveLength(2);

    const { context: readOneContext } = await seedRun(fixture.marketing, task);
    const byUuid = await invokeCapability({
      toolset,
      capabilityKey: "marketing.read_content",
      args: { uuid },
      runtimeContext: readOneContext,
    });
    expect(JSON.parse(byUuid.sanitizedResult).uuid).toBe(uuid);
  });

  test("Marketing has no project, git, browser, or memory-write tool", async () => {
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.MARKETING, db });
    for (const key of Object.keys(toolset.tools))
      expect(key.match(/^(project\.|git\.|browser\.|memory\.write)/)).toBeNull();
  });

  test("re-recording the same title/channel/format produces a second distinct row, not an upsert", async () => {
    const task = await makeTask(fixture.marketing);
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.MARKETING, db });
    const { context: c1 } = await seedRun(fixture.marketing, task);
    await invokeCapability({
      toolset,
      capabilityKey: "marketing.record_content",
      args: { title: "Launch announcement", channel: "twitter", format: "thread" },
      runtimeContext: c1,
    });
    const { context: c2 } = await seedRun(fixture.marketing, task);
    await invokeCapability({
      toolset,
      capabilityKey: "marketing.record_content",
      args: { title: "Launch announcement", channel: "twitter", format: "thread" },
      runtimeContext: c2,
    });
    expect(await db.yusuf_marketing_content.count()).toBe(2);
  });
});
