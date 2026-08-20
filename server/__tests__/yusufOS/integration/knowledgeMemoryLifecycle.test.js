const { randomUUID } = require("crypto");
const {
  createTestDatabase,
  clearYusufTables,
} = require("../../../__testUtils__/yusufOS/testDatabase");
const { createAgentFixture } = require("../../../__testUtils__/yusufOS/agentFixture");
const {
  buildAgentToolset,
  invokeCapability,
} = require("../../../domain/yusufOS/agents/toolBinding");
const {
  AgentRunCoordinator,
} = require("../../../domain/yusufOS/agents/AgentRunCoordinator");
const {
  tombstoneExpiredEvidence,
  TOMBSTONE_SUMMARY,
} = require("../../../domain/yusufOS/evidence/EvidenceRetention");
const {
  AGENT_KEYS,
  EVIDENCE_KINDS,
  EVIDENCE_CLASSES,
  MEMORY_SCOPES,
} = require("../../../domain/yusufOS/constants");

describe("Phase J — Knowledge / Memory governed lifecycle", () => {
  let testDatabase;
  let db;
  let fixture;
  let runs;

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
    runs = new AgentRunCoordinator(db);
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

  // --- Knowledge -----------------------------------------------------------

  test("Engineering writes a Knowledge entry and Reviewer can read it back", async () => {
    const task = await makeTask(fixture.engineering);
    const { context } = await seedRun(fixture.engineering, task);
    const engineeringTools = buildAgentToolset({ agentKey: AGENT_KEYS.ENGINEERING, db });
    const writeReceipt = await invokeCapability({
      toolset: engineeringTools,
      capabilityKey: "knowledge.write",
      args: {
        title: "Test command",
        body: "This project's validation command is project.run_tests.",
        sourceType: "AGENT_DERIVED",
        tags: ["testing"],
      },
      runtimeContext: context,
    });
    expect(writeReceipt.verificationStatus).toBe("VERIFIED");
    const written = JSON.parse(writeReceipt.sanitizedResult);

    const reviewerTask = await makeTask(fixture.reviewer);
    const { context: reviewerContext } = await seedRun(fixture.reviewer, reviewerTask);
    const reviewerTools = buildAgentToolset({ agentKey: AGENT_KEYS.REVIEWER, db });
    const readReceipt = await invokeCapability({
      toolset: reviewerTools,
      capabilityKey: "knowledge.read",
      args: { uuid: written.uuid },
      runtimeContext: reviewerContext,
    });
    const read = JSON.parse(readReceipt.sanitizedResult);
    expect(read.title).toBe("Test command");
    expect(read.tags).toEqual(["testing"]);
  });

  test("Reviewer has no knowledge.write tool at all", async () => {
    const reviewerTools = buildAgentToolset({ agentKey: AGENT_KEYS.REVIEWER, db });
    expect(reviewerTools.tools["knowledge.write"]).toBeUndefined();
  });

  test("two writes with identical content produce two distinct Knowledge entries", async () => {
    const task = await makeTask(fixture.engineering);
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.ENGINEERING, db });
    const args = {
      title: "Dup",
      body: "Same body twice.",
      sourceType: "AGENT_DERIVED",
    };
    const { context: c1 } = await seedRun(fixture.engineering, task);
    const r1 = await invokeCapability({ toolset, capabilityKey: "knowledge.write", args, runtimeContext: c1 });
    const { context: c2 } = await seedRun(fixture.engineering, task);
    const r2 = await invokeCapability({ toolset, capabilityKey: "knowledge.write", args, runtimeContext: c2 });
    const u1 = JSON.parse(r1.sanitizedResult).uuid;
    const u2 = JSON.parse(r2.sanitizedResult).uuid;
    expect(u1).not.toBe(u2);
    expect(await db.yusuf_knowledge_entries.count()).toBe(2);
  });

  test("Knowledge read by tag returns matching entries only", async () => {
    const task = await makeTask(fixture.engineering);
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.ENGINEERING, db });
    const { context: c1 } = await seedRun(fixture.engineering, task);
    await invokeCapability({
      toolset,
      capabilityKey: "knowledge.write",
      args: { title: "A", body: "body a", sourceType: "AGENT_DERIVED", tags: ["alpha"] },
      runtimeContext: c1,
    });
    const { context: c2 } = await seedRun(fixture.engineering, task);
    await invokeCapability({
      toolset,
      capabilityKey: "knowledge.write",
      args: { title: "B", body: "body b", sourceType: "AGENT_DERIVED", tags: ["beta"] },
      runtimeContext: c2,
    });
    const { context: c3 } = await seedRun(fixture.engineering, task);
    const readReceipt = await invokeCapability({
      toolset,
      capabilityKey: "knowledge.read",
      args: { tag: "alpha" },
      runtimeContext: c3,
    });
    const result = JSON.parse(readReceipt.sanitizedResult);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].title).toBe("A");
  });

  // --- Memory ----------------------------------------------------------------

  test("Engineering writes and reads PROJECT-scoped memory bound to its own task's project", async () => {
    const task = await makeTask(fixture.engineering);
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.ENGINEERING, db });
    const { context: writeCtx } = await seedRun(fixture.engineering, task);
    const writeReceipt = await invokeCapability({
      toolset,
      capabilityKey: "memory.write",
      args: {
        scope: MEMORY_SCOPES.PROJECT,
        scopeRef: fixture.project.uuid,
        key: "test_command",
        value: "project.run_tests",
      },
      runtimeContext: writeCtx,
    });
    expect(writeReceipt.verificationStatus).toBe("VERIFIED");

    const { context: readCtx } = await seedRun(fixture.engineering, task);
    const readReceipt = await invokeCapability({
      toolset,
      capabilityKey: "memory.read",
      args: { scope: MEMORY_SCOPES.PROJECT, scopeRef: fixture.project.uuid, key: "test_command" },
      runtimeContext: readCtx,
    });
    expect(JSON.parse(readReceipt.sanitizedResult).value).toBe("project.run_tests");
  });

  test("PROJECT-scoped memory for a different project than the task's is refused", async () => {
    const otherProject = await db.yusuf_projects.create({
      data: { uuid: randomUUID(), key: `other-${randomUUID()}`, name: "Other project" },
    });
    const task = await makeTask(fixture.engineering);
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.ENGINEERING, db });
    const { context } = await seedRun(fixture.engineering, task);
    await expect(
      invokeCapability({
        toolset,
        capabilityKey: "memory.write",
        args: {
          scope: MEMORY_SCOPES.PROJECT,
          scopeRef: otherProject.uuid,
          key: "leak",
          value: "should not land",
        },
        runtimeContext: context,
      })
    ).rejects.toMatchObject({ code: "ACTION_FORBIDDEN" });
    expect(await db.yusuf_memory_entries.count()).toBe(0);
  });

  test("AGENT-scoped memory for another agent's uuid is refused", async () => {
    const task = await makeTask(fixture.engineering);
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.ENGINEERING, db });
    const { context } = await seedRun(fixture.engineering, task);
    await expect(
      invokeCapability({
        toolset,
        capabilityKey: "memory.write",
        args: {
          scope: MEMORY_SCOPES.AGENT,
          scopeRef: fixture.reviewer.uuid,
          key: "spy",
          value: "nope",
        },
        runtimeContext: context,
      })
    ).rejects.toMatchObject({ code: "ACTION_FORBIDDEN" });
  });

  test("AGENT-scoped memory for the acting agent's own uuid succeeds", async () => {
    const task = await makeTask(fixture.engineering);
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.ENGINEERING, db });
    const { context } = await seedRun(fixture.engineering, task);
    const receipt = await invokeCapability({
      toolset,
      capabilityKey: "memory.write",
      args: {
        scope: MEMORY_SCOPES.AGENT,
        scopeRef: fixture.engineering.uuid,
        key: "note",
        value: "own memory",
      },
      runtimeContext: context,
    });
    expect(receipt.verificationStatus).toBe("VERIFIED");
  });

  test("TASK-scoped memory for a different task's uuid is refused", async () => {
    const task = await makeTask(fixture.engineering);
    const otherTask = await makeTask(fixture.engineering);
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.ENGINEERING, db });
    const { context } = await seedRun(fixture.engineering, task);
    await expect(
      invokeCapability({
        toolset,
        capabilityKey: "memory.write",
        args: {
          scope: MEMORY_SCOPES.TASK,
          scopeRef: otherTask.uuid,
          key: "cross-task",
          value: "nope",
        },
        runtimeContext: context,
      })
    ).rejects.toMatchObject({ code: "ACTION_FORBIDDEN" });
  });

  test("PERSONAL scope is refused for an Agent principal even though memory.write is granted", async () => {
    const task = await makeTask(fixture.engineering);
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.ENGINEERING, db });
    const { context } = await seedRun(fixture.engineering, task);
    await expect(
      invokeCapability({
        toolset,
        capabilityKey: "memory.write",
        args: {
          scope: MEMORY_SCOPES.PERSONAL,
          scopeRef: "yusuf",
          key: "anything",
          value: "nope",
        },
        runtimeContext: context,
      })
    ).rejects.toMatchObject({ code: "ACTION_FORBIDDEN" });
  });

  test("writing the same (scope, scopeRef, key) twice upserts rather than duplicating", async () => {
    const task = await makeTask(fixture.engineering);
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.ENGINEERING, db });
    const target = { scope: MEMORY_SCOPES.PROJECT, scopeRef: fixture.project.uuid, key: "duplicate-key" };
    const { context: c1 } = await seedRun(fixture.engineering, task);
    await invokeCapability({
      toolset,
      capabilityKey: "memory.write",
      args: { ...target, value: "first" },
      runtimeContext: c1,
    });
    const { context: c2 } = await seedRun(fixture.engineering, task);
    await invokeCapability({
      toolset,
      capabilityKey: "memory.write",
      args: { ...target, value: "second" },
      runtimeContext: c2,
    });
    expect(await db.yusuf_memory_entries.count()).toBe(1);
    const { context: c3 } = await seedRun(fixture.engineering, task);
    const readReceipt = await invokeCapability({
      toolset,
      capabilityKey: "memory.read",
      args: target,
      runtimeContext: c3,
    });
    expect(JSON.parse(readReceipt.sanitizedResult).value).toBe("second");
  });

  // --- Evidence classification + retention ------------------------------

  async function seedRunForEvidence() {
    const task = await makeTask(fixture.engineering);
    const { run } = await seedRun(fixture.engineering, task);
    return { task, run };
  }

  test("recordEvidence refuses SECRET_FORBIDDEN outright", async () => {
    const { task, run } = await seedRunForEvidence();
    await expect(
      runs.recordEvidence({
        runId: run.id,
        taskId: task.id,
        kind: EVIDENCE_KINDS.ANALYSIS,
        status: "INFO",
        summary: "attempted secret",
        payload: { apiKey: "sk-should-never-land" },
        evidenceClass: EVIDENCE_CLASSES.SECRET_FORBIDDEN,
      })
    ).rejects.toMatchObject({ code: "ACTION_FORBIDDEN" });
    expect(await db.yusuf_run_evidence.count()).toBe(0);
  });

  test("recordEvidence derives expiresAt from the evidence class's retention", async () => {
    const { task, run } = await seedRunForEvidence();
    const before = Date.now();
    const evidence = await runs.recordEvidence({
      runId: run.id,
      taskId: task.id,
      kind: EVIDENCE_KINDS.ANALYSIS,
      status: "INFO",
      summary: "a screenshot was taken",
      evidenceClass: EVIDENCE_CLASSES.SCREENSHOT,
    });
    expect(evidence.evidenceClass).toBe("SCREENSHOT");
    const expectedMs = 14 * 24 * 60 * 60 * 1000;
    const actualMs = new Date(evidence.expiresAt).getTime() - before;
    expect(actualMs).toBeGreaterThan(expectedMs - 5000);
    expect(actualMs).toBeLessThan(expectedMs + 60000);
  });

  test("tombstoneExpiredEvidence truncates content but preserves digest and classification", async () => {
    const { task, run } = await seedRunForEvidence();
    const evidence = await runs.recordEvidence({
      runId: run.id,
      taskId: task.id,
      kind: EVIDENCE_KINDS.ANALYSIS,
      status: "INFO",
      summary: "expires immediately",
      payload: { detail: "sensitive-ish" },
      evidenceClass: EVIDENCE_CLASSES.SENSITIVE_OPERATIONAL,
    });
    await db.yusuf_run_evidence.update({
      where: { id: evidence.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const result = await tombstoneExpiredEvidence(db);
    expect(result.tombstonedCount).toBe(1);

    const reread = await db.yusuf_run_evidence.findUnique({ where: { id: evidence.id } });
    expect(reread.summary).toBe(TOMBSTONE_SUMMARY);
    expect(JSON.parse(reread.payload)).toEqual({ tombstoned: true });
    expect(reread.digest).toBe(evidence.digest);
    expect(reread.evidenceClass).toBe("SENSITIVE_OPERATIONAL");
    expect(reread.tombstonedAt).not.toBeNull();

    const events = await db.yusuf_audit_events.findMany({
      where: { eventType: "evidence.tombstoned" },
    });
    expect(events).toHaveLength(1);
  });

  test("a failed audit append leaves the evidence row untouched rather than half-truncated", async () => {
    const { task, run } = await seedRunForEvidence();
    const evidence = await runs.recordEvidence({
      runId: run.id,
      taskId: task.id,
      kind: EVIDENCE_KINDS.ANALYSIS,
      status: "INFO",
      summary: "expires immediately too",
      evidenceClass: EVIDENCE_CLASSES.SCREENSHOT,
    });
    await db.yusuf_run_evidence.update({
      where: { id: evidence.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const savedKey = process.env.YUSUF_OS_AUDIT_HMAC_KEY;
    delete process.env.YUSUF_OS_AUDIT_HMAC_KEY;
    let result;
    try {
      result = await tombstoneExpiredEvidence(db);
    } finally {
      process.env.YUSUF_OS_AUDIT_HMAC_KEY = savedKey;
    }

    expect(result.tombstonedCount).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].uuid).toBe(evidence.uuid);
    const reread = await db.yusuf_run_evidence.findUnique({ where: { id: evidence.id } });
    expect(reread.summary).toBe("expires immediately too");
    expect(reread.tombstonedAt).toBeNull();
  });

  test("tombstoneExpiredEvidence leaves not-yet-expired evidence untouched", async () => {
    const { task, run } = await seedRunForEvidence();
    const evidence = await runs.recordEvidence({
      runId: run.id,
      taskId: task.id,
      kind: EVIDENCE_KINDS.ANALYSIS,
      status: "INFO",
      summary: "still fresh",
      evidenceClass: EVIDENCE_CLASSES.PUBLIC_METADATA,
    });
    const result = await tombstoneExpiredEvidence(db);
    expect(result.tombstonedCount).toBe(0);
    const reread = await db.yusuf_run_evidence.findUnique({ where: { id: evidence.id } });
    expect(reread.summary).toBe("still fresh");
    expect(reread.tombstonedAt).toBeNull();
  });
});
