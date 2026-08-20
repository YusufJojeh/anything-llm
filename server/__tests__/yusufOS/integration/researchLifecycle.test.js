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

describe("Phase O — Research governed lifecycle", () => {
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

  test("recording a new research item always starts at OPEN, even if the model asks for something else", async () => {
    const task = await makeTask(fixture.research);
    const { context } = await seedRun(fixture.research, task);
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.RESEARCH, db });
    const receipt = await invokeCapability({
      toolset,
      capabilityKey: "research.record_item",
      args: {
        question: "Which vector DB fits Yusuf OS's memory scope model?",
        category: "infrastructure",
        status: "ANSWERED",
      },
      runtimeContext: context,
    });
    expect(receipt.verificationStatus).toBe("VERIFIED");
    const result = JSON.parse(receipt.sanitizedResult);
    expect(result.status).toBe("OPEN");
    const row = await db.yusuf_research_items.findUnique({
      where: { uuid: result.uuid },
    });
    expect(row.question).toBe(
      "Which vector DB fits Yusuf OS's memory scope model?"
    );
    expect(row.status).toBe("OPEN");
  });

  test("a valid forward transition (OPEN -> INVESTIGATING) succeeds and updates notes", async () => {
    const task = await makeTask(fixture.research);
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.RESEARCH, db });
    const { context: createContext } = await seedRun(fixture.research, task);
    const created = await invokeCapability({
      toolset,
      capabilityKey: "research.record_item",
      args: { question: "What is the best local model for Gate O?", category: "ai" },
      runtimeContext: createContext,
    });
    const { uuid } = JSON.parse(created.sanitizedResult);

    const { context: updateContext } = await seedRun(fixture.research, task);
    const updated = await invokeCapability({
      toolset,
      capabilityKey: "research.update_status",
      args: {
        uuid,
        status: "INVESTIGATING",
        notes: "Comparing Gemma and Llama variants",
      },
      runtimeContext: updateContext,
    });
    expect(updated.verificationStatus).toBe("VERIFIED");
    const row = await db.yusuf_research_items.findUnique({ where: { uuid } });
    expect(row.status).toBe("INVESTIGATING");
    expect(row.notes).toBe("Comparing Gemma and Llama variants");
  });

  test("the reopening edge (ANSWERED -> INVESTIGATING) succeeds", async () => {
    const task = await makeTask(fixture.research);
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.RESEARCH, db });
    const { context: c1 } = await seedRun(fixture.research, task);
    const created = await invokeCapability({
      toolset,
      capabilityKey: "research.record_item",
      args: { question: "Is SQLite enough for v1?", category: "infrastructure" },
      runtimeContext: c1,
    });
    const { uuid } = JSON.parse(created.sanitizedResult);
    for (const status of ["INVESTIGATING", "ANSWERED"]) {
      const { context } = await seedRun(fixture.research, task);
      await invokeCapability({
        toolset,
        capabilityKey: "research.update_status",
        args: { uuid, status },
        runtimeContext: context,
      });
    }
    const { context: reopenContext } = await seedRun(fixture.research, task);
    const reopened = await invokeCapability({
      toolset,
      capabilityKey: "research.update_status",
      args: {
        uuid,
        status: "INVESTIGATING",
        notes: "New evidence suggests the earlier answer was wrong",
      },
      runtimeContext: reopenContext,
    });
    expect(reopened.verificationStatus).toBe("VERIFIED");
    const row = await db.yusuf_research_items.findUnique({ where: { uuid } });
    expect(row.status).toBe("INVESTIGATING");
    expect(row.notes).toBe("New evidence suggests the earlier answer was wrong");
  });

  test("an illegal transition (OPEN -> ANSWERED) is rejected before any write", async () => {
    const task = await makeTask(fixture.research);
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.RESEARCH, db });
    const { context: createContext } = await seedRun(fixture.research, task);
    const created = await invokeCapability({
      toolset,
      capabilityKey: "research.record_item",
      args: { question: "Should we adopt gRPC internally?", category: "infrastructure" },
      runtimeContext: createContext,
    });
    const { uuid, digest } = JSON.parse(created.sanitizedResult);

    const { context: updateContext } = await seedRun(fixture.research, task);
    await expect(
      invokeCapability({
        toolset,
        capabilityKey: "research.update_status",
        args: { uuid, status: "ANSWERED" },
        runtimeContext: updateContext,
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const row = await db.yusuf_research_items.findUnique({ where: { uuid } });
    expect(row.status).toBe("OPEN");
    expect(row.digest).toBe(digest);
  });

  test("a terminal item (ABANDONED) refuses any further transition", async () => {
    const task = await makeTask(fixture.research);
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.RESEARCH, db });
    const { context: c1 } = await seedRun(fixture.research, task);
    const created = await invokeCapability({
      toolset,
      capabilityKey: "research.record_item",
      args: { question: "Is Ollama viable offline?", category: "ai" },
      runtimeContext: c1,
    });
    const { uuid } = JSON.parse(created.sanitizedResult);

    const { context: c2 } = await seedRun(fixture.research, task);
    await invokeCapability({
      toolset,
      capabilityKey: "research.update_status",
      args: { uuid, status: "ABANDONED" },
      runtimeContext: c2,
    });

    const { context: c3 } = await seedRun(fixture.research, task);
    await expect(
      invokeCapability({
        toolset,
        capabilityKey: "research.update_status",
        args: { uuid, status: "INVESTIGATING" },
        runtimeContext: c3,
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  test("an unknown research item uuid is rejected before any write", async () => {
    const task = await makeTask(fixture.research);
    const { context } = await seedRun(fixture.research, task);
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.RESEARCH, db });
    await expect(
      invokeCapability({
        toolset,
        capabilityKey: "research.update_status",
        args: { uuid: randomUUID(), status: "INVESTIGATING" },
        runtimeContext: context,
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(await db.yusuf_research_items.count()).toBe(0);
  });

  test("reading by status filters correctly and reading by uuid returns one row", async () => {
    const task = await makeTask(fixture.research);
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.RESEARCH, db });
    const { context: c1 } = await seedRun(fixture.research, task);
    const created = await invokeCapability({
      toolset,
      capabilityKey: "research.record_item",
      args: { question: "What is the moat for a solo founder?", category: "business" },
      runtimeContext: c1,
    });
    const { uuid } = JSON.parse(created.sanitizedResult);
    const { context: c2 } = await seedRun(fixture.research, task);
    await invokeCapability({
      toolset,
      capabilityKey: "research.record_item",
      args: { question: "How to price a SaaS MVP?", category: "business" },
      runtimeContext: c2,
    });

    const { context: readContext } = await seedRun(fixture.research, task);
    const byStatus = await invokeCapability({
      toolset,
      capabilityKey: "research.read_items",
      args: { status: "OPEN" },
      runtimeContext: readContext,
    });
    expect(JSON.parse(byStatus.sanitizedResult).items).toHaveLength(2);

    const { context: readOneContext } = await seedRun(fixture.research, task);
    const byUuid = await invokeCapability({
      toolset,
      capabilityKey: "research.read_items",
      args: { uuid },
      runtimeContext: readOneContext,
    });
    expect(JSON.parse(byUuid.sanitizedResult).uuid).toBe(uuid);
  });

  test("Research has no project, git, browser, or memory-write tool", async () => {
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.RESEARCH, db });
    for (const key of Object.keys(toolset.tools))
      expect(key.match(/^(project\.|git\.|browser\.|memory\.write)/)).toBeNull();
  });

  test("re-recording the same question/category produces a second distinct row, not an upsert", async () => {
    const task = await makeTask(fixture.research);
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.RESEARCH, db });
    const { context: c1 } = await seedRun(fixture.research, task);
    await invokeCapability({
      toolset,
      capabilityKey: "research.record_item",
      args: { question: "What is the moat for a solo founder?", category: "business" },
      runtimeContext: c1,
    });
    const { context: c2 } = await seedRun(fixture.research, task);
    await invokeCapability({
      toolset,
      capabilityKey: "research.record_item",
      args: { question: "What is the moat for a solo founder?", category: "business" },
      runtimeContext: c2,
    });
    expect(await db.yusuf_research_items.count()).toBe(2);
  });
});
