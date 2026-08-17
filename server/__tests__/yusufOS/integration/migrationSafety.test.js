const { randomUUID } = require("crypto");
const {
  createTestDatabase,
} = require("../../../__testUtils__/yusufOS/testDatabase");

describe("Yusuf OS additive migration safety", () => {
  let testDatabase;
  let db;

  beforeAll(async () => {
    testDatabase = await createTestDatabase({ applyGateCSeparately: true });
    db = testDatabase.db;
  }, 120000);
  afterAll(async () => {
    if (testDatabase) await testDatabase.cleanup();
  });

  test("upstream schema upgrades with the isolated Gate C migration", async () => {
    const tables = await db.$queryRawUnsafe(
      "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'yusuf_%' ORDER BY name"
    );
    expect(tables.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "yusuf_agents",
        "yusuf_action_intents",
        "yusuf_approval_requests",
        "yusuf_action_receipts",
        "yusuf_audit_events",
      ])
    );
    expect(testDatabase.migrationOutput).toContain(
      "20260817033000_add_yusuf_os_core"
    );
  });

  test("confirmed API filters have migration-backed indexes", async () => {
    const indexes = await db.$queryRawUnsafe(
      "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'yusuf_%' ORDER BY name"
    );
    const names = indexes.map(({ name }) => name);
    expect(names).toEqual(
      expect.arrayContaining([
        "yusuf_approval_requests_status_requestedAt_idx",
        "yusuf_tasks_status_priority_updatedAt_idx",
        "yusuf_tasks_assignedAgentId_status_idx",
        "yusuf_agent_runs_taskId_status_idx",
        "yusuf_agent_runs_agentId_status_idx",
        "yusuf_audit_events_occurredAt_id_idx",
      ])
    );
  });

  test("database constraints reject duplicates, illegal status, and self dependencies", async () => {
    const agent = await db.yusuf_agents.create({
      data: {
        uuid: randomUUID(),
        key: "migration-agent",
        name: "Migration agent",
        mission: "Test constraints.",
        instructions: "No execution.",
      },
    });
    await db.yusuf_agent_capabilities.create({
      data: {
        agentId: agent.id,
        capabilityKey: "core.read_state",
        capabilityVersion: 1,
      },
    });
    await expect(
      db.yusuf_agent_capabilities.create({
        data: {
          agentId: agent.id,
          capabilityKey: "core.read_state",
          capabilityVersion: 1,
        },
      })
    ).rejects.toBeTruthy();
    await expect(
      db.$executeRawUnsafe(
        `INSERT INTO yusuf_tasks (uuid, requestedByPrincipalType, requestedByPrincipalId, title, objective, status, requestId) VALUES (?, 'USER', 'yusuf', 'bad', 'bad', 'VERIFIED', 'request')`,
        randomUUID()
      )
    ).rejects.toBeTruthy();

    const task = await db.yusuf_tasks.create({
      data: {
        uuid: randomUUID(),
        requestedByPrincipalType: "USER",
        requestedByPrincipalId: "yusuf",
        title: "Dependency task",
        objective: "Test self dependency.",
        requestId: randomUUID(),
      },
    });
    await expect(
      db.yusuf_task_dependencies.create({
        data: { taskId: task.id, dependsOnTaskId: task.id },
      })
    ).rejects.toBeTruthy();
  });

  test("audit history has no cascading foreign keys", async () => {
    const foreignKeys = await db.$queryRawUnsafe(
      "PRAGMA foreign_key_list('yusuf_audit_events')"
    );
    expect(foreignKeys).toHaveLength(0);
  });
});
