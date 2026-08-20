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
    // Every Yusuf migration applied cleanly on top of a fully migrated
    // upstream database, in gate order.
    expect(testDatabase.yusufMigrations).toEqual([
      "20260817033000_add_yusuf_os_core",
      "20260817120000_add_yusuf_os_git_repositories",
      "20260817180000_add_yusuf_os_agent_runtime",
      "20260818090000_add_yusuf_os_knowledge_evidence_memory",
      "20260820120000_add_yusuf_os_monitoring",
    ]);
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

  test("later gates preserve Gate C's CHECK constraints through table redefinition", async () => {
    // Prisma's SQLite "add a column" strategy rewrites the whole table and
    // does not carry CHECK constraints across, so every gate that adds a
    // column to an existing yusuf_* table must restore them by hand. This
    // asserts the constraints still bite after all migrations have run.
    await expect(
      db.$executeRawUnsafe(
        `INSERT INTO yusuf_agent_runs (uuid, taskId, requestedByPrincipalType, requestedByPrincipalId, status, requestId) VALUES (?, 1, 'USER', 'yusuf', 'NOT_A_REAL_STATUS', 'request')`,
        randomUUID()
      )
    ).rejects.toBeTruthy();
    await expect(
      db.$executeRawUnsafe(
        `INSERT INTO yusuf_agent_runs (uuid, taskId, requestedByPrincipalType, requestedByPrincipalId, runKind, requestId) VALUES (?, 1, 'USER', 'yusuf', 'NOT_A_REAL_KIND', 'request')`,
        randomUUID()
      )
    ).rejects.toBeTruthy();
    await expect(
      db.$executeRawUnsafe(
        `INSERT INTO yusuf_tasks (uuid, requestedByPrincipalType, requestedByPrincipalId, title, objective, priority, requestId) VALUES (?, 'USER', 'yusuf', 'bad', 'bad', 'P9', 'request')`,
        randomUUID()
      )
    ).rejects.toBeTruthy();
  });

  test("Gate E enum-backed columns reject values outside their contract", async () => {
    await expect(
      db.$executeRawUnsafe(
        `INSERT INTO yusuf_handoffs (uuid, taskId, fromAgentId, toAgentId, reason, status, idempotencyKey, requestId) VALUES (?, 1, 1, 2, 'x', 'NOT_A_STATUS', ?, 'request')`,
        randomUUID(),
        randomUUID()
      )
    ).rejects.toBeTruthy();
    await expect(
      db.$executeRawUnsafe(
        `INSERT INTO yusuf_review_verdicts (uuid, taskId, reviewRunId, reviewerAgentId, verdict, summary, evidenceDigest, requestId) VALUES (?, 1, 1, 1, 'DEFINITELY_FINE', 's', 'd', 'request')`,
        randomUUID()
      )
    ).rejects.toBeTruthy();
  });

  test("audit history has no cascading foreign keys", async () => {
    const foreignKeys = await db.$queryRawUnsafe(
      "PRAGMA foreign_key_list('yusuf_audit_events')"
    );
    expect(foreignKeys).toHaveLength(0);
  });
});
