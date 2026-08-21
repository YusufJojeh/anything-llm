const { randomUUID } = require("crypto");
const {
  createTestDatabase,
  clearYusufTables,
} = require("../../../__testUtils__/yusufOS/testDatabase");
const {
  AgentRunCoordinator,
} = require("../../../domain/yusufOS/agents/AgentRunCoordinator");
const {
  CONFIDENCE,
  PROVIDER_KINDS,
} = require("../../../domain/yusufOS/models/constants");

describe("Phase R — AgentRunCoordinator.recordModelCompletion", () => {
  let testDatabase;
  let db;
  let coordinator;

  beforeAll(async () => {
    testDatabase = await createTestDatabase();
    db = testDatabase.db;
    coordinator = new AgentRunCoordinator(db);
  }, 120000);

  afterAll(async () => {
    if (testDatabase) await testDatabase.cleanup();
  });

  beforeEach(async () => clearYusufTables(db));

  async function seedRun() {
    const requestId = randomUUID();
    const agent = await db.yusuf_agents.create({
      data: {
        uuid: randomUUID(),
        key: `agent-${randomUUID()}`,
        name: "Test Agent",
        mission: "test",
        instructions: "test",
        status: "ACTIVE",
      },
    });
    const task = await db.yusuf_tasks.create({
      data: {
        uuid: randomUUID(),
        assignedAgentId: agent.id,
        requestedByPrincipalType: "AGENT",
        requestedByPrincipalId: agent.uuid,
        title: "t",
        objective: "o",
        status: "RUNNING",
        requestId,
      },
    });
    return db.yusuf_agent_runs.create({
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
  }

  test("persists provider/model/policy/fallback/latency and KNOWN usage/cost", async () => {
    const run = await seedRun();
    await coordinator.recordModelCompletion({
      runId: run.id,
      routed: {
        provider: PROVIDER_KINDS.OPENAI,
        model: "gpt-4o-mini",
        policy: "FALLBACK_CHAIN",
        fallbackOccurred: true,
        latencyMs: 123,
        usage: {
          confidence: CONFIDENCE.KNOWN,
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
        },
        cost: { confidence: CONFIDENCE.ESTIMATED, amountMicros: 42 },
      },
    });
    const updated = await db.yusuf_agent_runs.findUnique({
      where: { id: run.id },
    });
    const modelRef = JSON.parse(updated.modelRef);
    expect(modelRef).toMatchObject({
      telemetryKind: "ROUTED_COMPLETION",
      provider: PROVIDER_KINDS.OPENAI,
      model: "gpt-4o-mini",
      policy: "FALLBACK_CHAIN",
      fallbackOccurred: true,
      latencyMs: 123,
      usageConfidence: CONFIDENCE.KNOWN,
      costConfidence: CONFIDENCE.ESTIMATED,
    });
    const tokenUsage = JSON.parse(updated.tokenUsage);
    expect(tokenUsage.totalTokens).toBe(15);
    expect(updated.estimatedCostMicros).toBe(42);
  });

  test("UNAVAILABLE cost is persisted as null, never coerced to 0", async () => {
    const run = await seedRun();
    await coordinator.recordModelCompletion({
      runId: run.id,
      routed: {
        provider: PROVIDER_KINDS.OLLAMA,
        model: "llama3:latest",
        policy: "LOCAL_ONLY",
        fallbackOccurred: false,
        latencyMs: 50,
        usage: { confidence: CONFIDENCE.UNAVAILABLE },
        cost: { confidence: CONFIDENCE.UNAVAILABLE, amountMicros: null },
      },
    });
    const updated = await db.yusuf_agent_runs.findUnique({
      where: { id: run.id },
    });
    expect(updated.estimatedCostMicros).toBeNull();
    const modelRef = JSON.parse(updated.modelRef);
    expect(modelRef.costConfidence).toBe(CONFIDENCE.UNAVAILABLE);
    expect(modelRef.usageConfidence).toBe(CONFIDENCE.UNAVAILABLE);
  });

  test("createRun cannot forge routed-completion provenance", async () => {
    const seeded = await seedRun();
    await db.yusuf_agent_runs.delete({ where: { id: seeded.id } });
    const created = await coordinator.createRun({
      taskId: seeded.taskId,
      agentId: seeded.agentId,
      principal: { type: "AGENT", id: "test-agent" },
      requestId: randomUUID(),
      modelRef: {
        telemetryKind: "ROUTED_COMPLETION",
        provider: "forged-provider",
        model: "forged-model",
      },
    });
    expect(JSON.parse(created.modelRef)).toEqual({
      provider: "forged-provider",
      model: "forged-model",
    });
  });
});
