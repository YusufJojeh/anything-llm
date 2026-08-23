const express = require("express");
const bodyParser = require("body-parser");
const { randomUUID } = require("crypto");
const { yusufOSEndpoints } = require("../../../endpoints/yusufOS");
const {
  createTestDatabase,
  clearYusufTables,
} = require("../../../__testUtils__/yusufOS/testDatabase");
const {
  createAgentFixture,
} = require("../../../__testUtils__/yusufOS/agentFixture");
const {
  RuntimeProjection,
} = require("../../../domain/yusufOS/projections/RuntimeProjection");
const { AGENT_KEYS } = require("../../../domain/yusufOS/constants");

/**
 * Phase S: read-only Command Center runtime projection. Covers model
 * runtime (Ollama/OpenAI/agent policies/recent completions), the
 * Department/Agent/Skill/Job view, Monitoring history, and the
 * Knowledge/Evidence/Memory split.
 *
 * The single most important property this suite proves: nothing here ever
 * lets the OpenAI key value reach the response, in any form, at any nesting
 * depth — even when a real-looking key is present in the environment.
 */
describe("Phase S — runtime projection", () => {
  let testDatabase;
  let db;
  let server;
  let baseUrl;
  let fixture;
  const token = "phase-s-control-token-that-is-at-least-32-characters";
  const SECRET_KEY = "sk-super-secret-value-must-never-leak-anywhere-12345";

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
    delete process.env.OPENAI_API_KEY;
    if (server) await new Promise((resolve) => server.close(resolve));
    if (testDatabase) await testDatabase.cleanup();
  });

  beforeEach(async () => {
    await clearYusufTables(db);
    fixture = await createAgentFixture({ db });
  });

  afterEach(() => {
    if (fixture) fixture.cleanup();
    delete process.env.OPENAI_API_KEY;
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

  test("requires Yusuf control-plane authentication", async () => {
    const response = await fetch(`${baseUrl}/runtime`);
    expect(response.status).toBe(401);
  });

  test("reports live Ollama health honestly", async () => {
    const response = await request("/runtime");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(typeof body.modelRuntime.ollama.reachable).toBe("boolean");
    expect(Array.isArray(body.modelRuntime.ollama.models)).toBe(true);
    if (!body.modelRuntime.ollama.reachable)
      expect(body.modelRuntime.ollama.models).toEqual([]);
    expect(body.modelRuntime.ollama.endpoint).toBe("http://localhost:11434");
    expect(typeof body.modelRuntime.ollama.gemmaFamily.present).toBe("boolean");
  });

  test("Ollama health uses generic tag-aware discovery, not a gemma4-only branch", async () => {
    const fakeOllama = {
      baseUrl: `http://user:${SECRET_KEY}@remote.example:11434/path?token=${SECRET_KEY}#secret`,
      health: async () => ({
        status: "HEALTHY",
        available: true,
        models: [
          { fullName: "gemma3:4b", name: "gemma3", tag: "4b", sizeBytes: 123 },
          {
            fullName: `llama3:${SECRET_KEY}${"x".repeat(300)}`,
            name: `llama3-${SECRET_KEY}`,
            tag: "latest",
            sizeBytes: 456,
          },
        ],
        error: null,
      }),
    };
    const projection = new RuntimeProjection(db, { ollama: fakeOllama });
    const result = await projection.build();
    expect(result.modelRuntime.ollama.reachable).toBe(true);
    expect(result.modelRuntime.ollama.models).toHaveLength(2);
    expect(result.modelRuntime.ollama.endpoint).toBe(
      "http://remote.example:11434"
    );
    expect(JSON.stringify(result)).not.toContain(SECRET_KEY);
    expect(result.modelRuntime.ollama.gemmaFamily.present).toBe(true);
    expect(result.modelRuntime.ollama.gemmaFamily.matches).toEqual([
      "gemma3:4b",
    ]);
  });

  test("OpenAI configured is a boolean only — the key value never appears anywhere in the response", async () => {
    process.env.OPENAI_API_KEY = SECRET_KEY;
    const response = await request("/runtime");
    const body = await response.json();
    expect(body.modelRuntime.openai).toEqual({ configured: true });
    const raw = JSON.stringify(body);
    expect(raw).not.toContain(SECRET_KEY);
    expect(raw).not.toContain(SECRET_KEY.slice(0, 8));
    expect(raw).not.toContain(SECRET_KEY.slice(-8));
  });

  test("OpenAI configured is false when no key is set", async () => {
    delete process.env.OPENAI_API_KEY;
    const response = await request("/runtime");
    const body = await response.json();
    expect(body.modelRuntime.openai).toEqual({ configured: false });
  });

  test("agent model policies come from the code-owned AgentDefinitions, one row per real agent", async () => {
    const response = await request("/runtime");
    const body = await response.json();
    const byId = Object.fromEntries(
      body.modelRuntime.agentModelPolicies.map((p) => [p.agentId, p])
    );
    expect(byId[AGENT_KEYS.ENGINEERING].routingPolicy).toBe("FALLBACK_CHAIN");
    expect(byId[AGENT_KEYS.CHIEF_OF_STAFF].role).toBe("orchestration");
  });

  test("recent completions render UNAVAILABLE cost distinctly from a real zero", async () => {
    const task = await fixture.createTask({});
    const run = await db.yusuf_agent_runs.create({
      data: {
        uuid: randomUUID(),
        taskId: task.id,
        agentId: fixture.engineering.id,
        requestedByPrincipalType: "USER",
        requestedByPrincipalId: "yusuf",
        status: "COMPLETED",
        requestId: randomUUID(),
        modelRef: JSON.stringify({
          telemetryKind: "ROUTED_COMPLETION",
          provider: "OLLAMA",
          model: "gemma4:7b",
          policy: "LOCAL_ONLY",
          fallbackOccurred: false,
          latencyMs: 42,
          usageConfidence: "KNOWN",
          costConfidence: "UNAVAILABLE",
        }),
        tokenUsage: JSON.stringify({
          confidence: "KNOWN",
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
        }),
        estimatedCostMicros: 999,
      },
    });
    await db.$transaction(
      Array.from({ length: 101 }, (_, index) =>
        db.yusuf_agent_runs.create({
          data: {
            uuid: randomUUID(),
            taskId: task.id,
            agentId: fixture.engineering.id,
            requestedByPrincipalType: "USER",
            requestedByPrincipalId: "yusuf",
            status: "COMPLETED",
            requestId: randomUUID(),
            modelRef: JSON.stringify({
              provider: "legacy",
              model: `old-${index}`,
            }),
            updatedAt: new Date("2030-01-01T00:00:00.000Z"),
          },
        })
      )
    );
    const response = await request("/runtime");
    const body = await response.json();
    const found = body.modelRuntime.recentCompletions.find(
      (c) => c.runId === run.uuid
    );
    expect(found).toBeDefined();
    expect(found.provider).toBe("OLLAMA");
    expect(found.fallbackOccurred).toBe(false);
    expect(found.costConfidence).toBe("UNAVAILABLE");
    expect(found.estimatedCostMicros).toBeNull();
    expect(found.usage.totalTokens).toBe(15);
  });

  test("unproven and malformed model references are not presented as completions", async () => {
    const task = await fixture.createTask({});
    await db.yusuf_agent_runs.create({
      data: {
        uuid: randomUUID(),
        taskId: task.id,
        agentId: fixture.engineering.id,
        requestedByPrincipalType: "USER",
        requestedByPrincipalId: "yusuf",
        status: "COMPLETED",
        requestId: randomUUID(),
        modelRef: JSON.stringify({ provider: "OLLAMA", model: "planned" }),
        tokenUsage: JSON.stringify({ totalTokens: -1, confidence: "FORGED" }),
      },
    });
    const body = await (await request("/runtime")).json();
    expect(body.modelRuntime.recentCompletions).toEqual([]);
  });

  test("departments project real Department/Agent/Skill/Job data, not fabricated numbers", async () => {
    const response = await request("/runtime");
    const body = await response.json();
    const engineering = body.departments.find(
      (d) => d.departmentId === "engineering"
    );
    expect(engineering).toBeDefined();
    const engAgent = engineering.agents.find(
      (a) => a.agentId === AGENT_KEYS.ENGINEERING
    );
    expect(engAgent.skills).toContain("project.write_file");
    expect(engAgent.jobs.total).toBe(0);

    const task = await fixture.createTask({});
    await db.yusuf_tasks.update({
      where: { id: task.id },
      data: { assignedAgentId: fixture.engineering.id },
    });
    const after = await (await request("/runtime")).json();
    const engAgentAfter = after.departments
      .find((d) => d.departmentId === "engineering")
      .agents.find((a) => a.agentId === AGENT_KEYS.ENGINEERING);
    expect(engAgentAfter.jobs.total).toBe(1);
  });

  test("monitoring history reflects the real yusuf_monitoring_checks table", async () => {
    await db.yusuf_monitoring_checks.create({
      data: {
        uuid: randomUUID(),
        checkKey: "system_health",
        status: "OK",
        observedValue: JSON.stringify({ pendingApprovals: 0 }),
        threshold: JSON.stringify({ maxPendingApprovals: 5 }),
        summary: "All signals nominal.",
        createdByPrincipalType: "AGENT",
        createdByPrincipalId: fixture.monitoring.uuid,
        digest: "x".repeat(64),
      },
    });
    const response = await request("/runtime");
    const body = await response.json();
    expect(body.monitoring.available).toBe(true);
    expect(body.monitoring.checks).toHaveLength(1);
    expect(body.monitoring.checks[0].checkKey).toBe("system_health");
    expect(body.monitoring.checks[0].status).toBe("OK");
  });

  test("monitoring JSON is recursively redacted before projection", async () => {
    await db.yusuf_monitoring_checks.create({
      data: {
        uuid: randomUUID(),
        checkKey: "system_health",
        status: "WARN",
        observedValue: JSON.stringify({
          nested: { apiKey: SECRET_KEY },
          note: `Authorization: Bearer ${SECRET_KEY}`,
        }),
        threshold: JSON.stringify({ password: SECRET_KEY }),
        summary: `Bearer ${SECRET_KEY}`,
        createdByPrincipalType: "AGENT",
        createdByPrincipalId: fixture.monitoring.uuid,
        digest: "x".repeat(64),
      },
    });
    const body = await (await request("/runtime")).json();
    const raw = JSON.stringify(body);
    expect(raw).not.toContain(SECRET_KEY);
    expect(body.monitoring.checks[0].observedValue.nested.apiKey).toBe(
      "[REDACTED]"
    );
  });

  test("knowledge/evidence/memory counts reflect the real split tables", async () => {
    await db.yusuf_knowledge_entries.create({
      data: {
        uuid: randomUUID(),
        title: `Sensitive knowledge ${SECRET_KEY}`,
        body: "Body text.",
        sourceType: "AGENT_DERIVED",
        createdByPrincipalType: "AGENT",
        createdByPrincipalId: fixture.monitoring.uuid,
        digest: "x".repeat(64),
      },
    });
    await db.yusuf_memory_entries.create({
      data: {
        uuid: randomUUID(),
        scope: "AGENT",
        scopeRef: fixture.engineering.uuid,
        key: `sensitive-memory-${SECRET_KEY}`,
        value: "value",
        createdByPrincipalType: "AGENT",
        createdByPrincipalId: fixture.engineering.uuid,
        digest: "x".repeat(64),
      },
    });
    const response = await request("/runtime");
    const body = await response.json();
    expect(body.knowledgeEvidenceMemory.knowledge.total).toBe(1);
    expect(body.knowledgeEvidenceMemory.memory.total).toBe(1);
    expect(body.knowledgeEvidenceMemory.knowledge.bySourceType).toEqual({
      AGENT_DERIVED: 1,
    });
    expect(body.knowledgeEvidenceMemory.memory.byScope).toEqual({ AGENT: 1 });
    expect(JSON.stringify(body)).not.toContain(SECRET_KEY);
  });
});
