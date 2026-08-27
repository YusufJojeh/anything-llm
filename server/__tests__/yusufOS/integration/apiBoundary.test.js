const express = require("express");
const bodyParser = require("body-parser");
const { yusufOSEndpoints } = require("../../../endpoints/yusufOS");
const {
  createTestDatabase,
  clearYusufTables,
} = require("../../../__testUtils__/yusufOS/testDatabase");
const { IntentService } = require("../../../domain/yusufOS/actions/IntentService");
const { PolicyEngine } = require("../../../domain/yusufOS/policy/PolicyEngine");

describe("Yusuf OS internal API boundary", () => {
  let testDatabase;
  let server;
  let baseUrl;
  const token = "gate-c-control-token-that-is-at-least-32-characters";
  const originalControlToken = process.env.YUSUF_OS_CONTROL_TOKEN;
  const originalBrowserSpeech =
    process.env.YUSUF_OS_VOICE_ALLOW_BROWSER_SPEECH;

  beforeAll(async () => {
    process.env.YUSUF_OS_CONTROL_TOKEN = token;
    process.env.YUSUF_OS_VOICE_ALLOW_BROWSER_SPEECH = "false";
    testDatabase = await createTestDatabase();
    const app = express();
    app.use(bodyParser.json({ limit: "256kb" }));
    const router = express.Router();
    app.use("/api", router);
    yusufOSEndpoints(router, { db: testDatabase.db });
    await new Promise((resolve) => {
      server = app.listen(0, "127.0.0.1", resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}/api/yusuf-os`;
  }, 120000);

  afterAll(async () => {
    if (originalControlToken === undefined)
      delete process.env.YUSUF_OS_CONTROL_TOKEN;
    else process.env.YUSUF_OS_CONTROL_TOKEN = originalControlToken;
    if (originalBrowserSpeech === undefined)
      delete process.env.YUSUF_OS_VOICE_ALLOW_BROWSER_SPEECH;
    else
      process.env.YUSUF_OS_VOICE_ALLOW_BROWSER_SPEECH = originalBrowserSpeech;
    if (server) await new Promise((resolve) => server.close(resolve));
    if (testDatabase) await testDatabase.cleanup();
  });
  beforeEach(async () => clearYusufTables(testDatabase.db));

  const request = (path, options = {}) =>
    fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        ...(options.headers || {}),
      },
    });

  test("all routes require Yusuf-specific authentication even on localhost", async () => {
    const response = await fetch(`${baseUrl}/bootstrap`);
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: { code: "UNAUTHORIZED" },
    });
    const mutation = await fetch(`${baseUrl}/agents`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: "unauthorized" }),
    });
    expect(mutation.status).toBe(401);
  });

  test("bootstrap exposes sanitized code-owned security status", async () => {
    const response = await request("/bootstrap");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      systemStatus: {
        controlPlane: "HEALTHY",
        externalMutationsDisabled: false,
      },
    });
  });

  test("voice routes inherit authentication and reject approval authority", async () => {
    const unauthenticated = await fetch(`${baseUrl}/voice/status`);
    expect(unauthenticated.status).toBe(401);

    const status = await request("/voice/status");
    expect(status.status).toBe(200);
    expect(await status.json()).toMatchObject({
      allowCloud: false,
      stt: {
        provider: "native",
        scope: "BROWSER",
        eligible: false,
        reason: "BROWSER_SPEECH_DISABLED",
      },
      wakeWord: "DEFERRED",
    });

    const forgedApproval = await request("/voice/commands", {
      method: "POST",
      body: JSON.stringify({ utterance: "apply", approved: true }),
    });
    expect(forgedApproval.status).toBe(422);
    expect(await forgedApproval.json()).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        details: { unknownFields: ["approved"] },
      },
    });

    const invalidAudio = new FormData();
    invalidAudio.append(
      "audio",
      new Blob(["not audio"], { type: "text/plain" }),
      "payload.txt"
    );
    const invalidUpload = await fetch(`${baseUrl}/voice/transcribe`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: invalidAudio,
    });
    expect(invalidUpload.status).toBe(422);
    expect(await invalidUpload.json()).toMatchObject({
      error: { code: "VALIDATION_ERROR", message: "Invalid voice audio upload." },
    });
  });

  test("validation rejects unknown authority fields with stable 422 envelope", async () => {
    const response = await request("/agents", {
      method: "POST",
      body: JSON.stringify({
        key: "engineering",
        name: "Engineering",
        mission: "Build safely.",
        instructions: "Obey policy.",
        riskLevel: "L0",
      }),
    });
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error).toMatchObject({
      code: "VALIDATION_ERROR",
      details: { unknownFields: ["riskLevel"] },
    });
    expect(body.error.requestId).toMatch(/^[a-f0-9-]{36}$/);
  });

  test("creates and lists isolated core entities", async () => {
    const agentResponse = await request("/agents", {
      method: "POST",
      body: JSON.stringify({
        key: "engineering",
        name: "Engineering",
        mission: "Build safely.",
        instructions: "Obey policy.",
      }),
    });
    expect(agentResponse.status).toBe(201);
    const agent = (await agentResponse.json()).agent;
    const taskResponse = await request("/tasks", {
      method: "POST",
      body: JSON.stringify({
        assignedAgentId: agent.id,
        title: "Core task",
        objective: "Prove API contracts.",
        priority: "P1",
      }),
    });
    expect(taskResponse.status).toBe(201);
    expect((await request("/agents")).status).toBe(200);
    expect((await request("/tasks?limit=10&offset=0")).status).toBe(200);
  });

  test("returns stable 404 and bounded pagination errors", async () => {
    const missing = await request("/tasks/999999");
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
    const invalid = await request("/tasks?limit=101");
    expect(invalid.status).toBe(422);
    expect(await invalid.json()).toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
  });

  test("database uniqueness conflicts use a stable secret-safe 409", async () => {
    const duplicate = {
      key: "duplicate",
      name: "Duplicate",
      mission: "Test conflict.",
      instructions: "No secrets.",
    };
    await request("/agents", { method: "POST", body: JSON.stringify(duplicate) });
    const response = await request("/agents", {
      method: "POST",
      body: JSON.stringify(duplicate),
    });
    expect(response.status).toBe(409);
    const serialized = JSON.stringify(await response.json());
    expect(serialized).toContain("CONFLICT");
    expect(serialized).not.toContain("Prisma");
    expect(serialized).not.toContain("stack");
  });

  test("approval decisions bind expected hash/version and stale repeats return 409", async () => {
    const db = testDatabase.db;
    const requestId = "approval-api-request";
    const agent = await db.yusuf_agents.create({
      data: {
        uuid: "approval-api-agent-uuid",
        key: "approval-api-agent",
        name: "Approval API Agent",
        mission: "Test approval API.",
        instructions: "Obey policy.",
        status: "ACTIVE",
      },
    });
    const task = await db.yusuf_tasks.create({
      data: {
        uuid: "approval-api-task-uuid",
        assignedAgentId: agent.id,
        requestedByPrincipalType: "AGENT",
        requestedByPrincipalId: agent.uuid,
        title: "Approval API task",
        objective: "Test durable decision.",
        status: "RUNNING",
        requestId,
      },
    });
    const run = await db.yusuf_agent_runs.create({
      data: {
        uuid: "approval-api-run-uuid",
        taskId: task.id,
        agentId: agent.id,
        requestedByPrincipalType: "AGENT",
        requestedByPrincipalId: agent.uuid,
        status: "RUNNING",
        requestId,
      },
    });
    await db.yusuf_agent_capabilities.create({
      data: {
        agentId: agent.id,
        capabilityKey: "core.external_mutation",
        capabilityVersion: 1,
      },
    });
    const intent = await new IntentService(db).create(
      {
        principal: { type: "AGENT", id: agent.uuid },
        agentId: agent.id,
        taskId: task.id,
        runId: run.id,
        capability: "core.external_mutation",
        resource: { type: "TEST", id: "one", version: "v1" },
        target: {},
        payload: {},
      },
      { requestId }
    );
    const policy = await new PolicyEngine(db).evaluate(intent.id);
    const currentIntent = await db.yusuf_action_intents.findUnique({
      where: { id: intent.id },
    });
    const decisionBody = {
      decision: "APPROVE",
      expectedPayloadHash: policy.approval.payloadHash,
      expectedIntentVersion: currentIntent.version,
      expectedApprovalVersion: policy.approval.version,
      note: "Approved by Yusuf.",
    };
    const approved = await request(`/approvals/${policy.approval.id}/decisions`, {
      method: "POST",
      body: JSON.stringify(decisionBody),
    });
    expect(approved.status).toBe(200);
    expect(await approved.json()).toMatchObject({
      approval: {
        status: "APPROVED",
        decidedByPrincipalType: "USER",
        decidedByPrincipalId: "local-yusuf",
      },
    });
    const repeated = await request(`/approvals/${policy.approval.id}/decisions`, {
      method: "POST",
      body: JSON.stringify(decisionBody),
    });
    expect(repeated.status).toBe(409);
    expect(await repeated.json()).toMatchObject({
      error: { code: "APPROVAL_ALREADY_DECIDED" },
    });
  });
});
