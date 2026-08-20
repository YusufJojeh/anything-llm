const express = require("express");
const bodyParser = require("body-parser");
const { randomUUID } = require("crypto");
const { yusufOSEndpoints } = require("../../../endpoints/yusufOS");
const {
  yusufUiSessionGuard,
  yusufUiSessionEndpoints,
  __clearSession,
} = require("../../../domain/yusufOS/api/uiSession");
const {
  yusufRequestContext,
} = require("../../../domain/yusufOS/api/requestContext");
const {
  createTestDatabase,
  clearYusufTables,
} = require("../../../__testUtils__/yusufOS/testDatabase");
const {
  createAgentFixture,
} = require("../../../__testUtils__/yusufOS/agentFixture");
const {
  ChiefOfStaff,
} = require("../../../domain/yusufOS/orchestration/ChiefOfStaff");
const {
  AgentRunCoordinator,
} = require("../../../domain/yusufOS/agents/AgentRunCoordinator");
const {
  resetProjectionCaches,
} = require("../../../domain/yusufOS/projections/DashboardProjection");
const {
  buildAgentToolset,
  invokeCapability,
} = require("../../../domain/yusufOS/agents/toolBinding");
const { AGENT_KEYS } = require("../../../domain/yusufOS/constants");

/**
 * Gate G backend surface: the browser session bootstrap and the uuid-addressed
 * drilldown projections the Command Center opens entities with.
 */
describe("Gate G — Command Center gateway and drilldown projections", () => {
  let testDatabase;
  let db;
  let server;
  let origin;
  let fixture;
  const token = "gate-g-control-token-that-is-at-least-32-characters";

  beforeAll(async () => {
    process.env.YUSUF_OS_CONTROL_TOKEN = token;
    testDatabase = await createTestDatabase();
    db = testDatabase.db;

    const app = express();
    const router = express.Router();
    // Mirrors server/index.js exactly, including order: the gateway guard is
    // mounted on the narrower prefix *before* the generic /api router, so a
    // request can never reach a Yusuf handler without passing through it.
    app.use(
      "/api/yusuf-os-ui",
      yusufRequestContext,
      bodyParser.json({ limit: "256kb" }),
      yusufUiSessionGuard
    );
    app.use("/api", router);
    yusufUiSessionEndpoints(router);
    yusufOSEndpoints(router, { db, preGuarded: true, basePath: "/yusuf-os-ui" });

    await new Promise((resolve) => {
      server = app.listen(0, "127.0.0.1", resolve);
    });
    origin = `http://127.0.0.1:${server.address().port}`;
  }, 180000);

  afterAll(async () => {
    delete process.env.YUSUF_OS_CONTROL_TOKEN;
    __clearSession();
    if (server) await new Promise((resolve) => server.close(resolve));
    if (testDatabase) await testDatabase.cleanup();
  });

  beforeEach(async () => {
    __clearSession();
    await clearYusufTables(db);
    resetProjectionCaches();
    fixture = await createAgentFixture({ db });
  });

  afterEach(() => {
    if (fixture) fixture.cleanup();
  });

  const ui = (path, options = {}) =>
    fetch(`${origin}/api/yusuf-os-ui${path}`, {
      ...options,
      headers: { "content-type": "application/json", ...(options.headers || {}) },
    });

  /** Unlocks and returns the cookie + CSRF token a real browser would hold. */
  async function unlock(controlToken = token) {
    const response = await ui("/session", {
      method: "POST",
      body: JSON.stringify({ controlToken }),
    });
    const body = await response.json();
    const setCookie = response.headers.get("set-cookie") || "";
    return {
      status: response.status,
      body,
      cookie: setCookie.split(";")[0],
      csrf: body.csrfToken,
    };
  }

  const engineeringContext = (run, task) => ({
    requestId: randomUUID(),
    principal: { type: "AGENT", id: fixture.engineering.uuid },
    agentId: fixture.engineering.id,
    taskId: task.id,
    runId: run.id,
  });

  describe("browser session bootstrap", () => {
    test("the gateway is locked until the control token is presented", async () => {
      const status = await (await ui("/session")).json();
      expect(status).toMatchObject({ unlocked: false, configured: true });
      expect(status.csrfToken).toBeNull();

      const denied = await ui("/dashboard");
      expect(denied.status).toBe(401);
      const body = await denied.json();
      expect(body.error.code).toBe("UNAUTHORIZED");
      expect(body.error.details.locked).toBe(true);
    });

    test("a wrong control token never establishes a session", async () => {
      const attempt = await unlock("x".repeat(64));
      expect(attempt.status).toBe(401);
      expect(attempt.body.error.code).toBe("UNAUTHORIZED");
      // No cookie was issued, and the gateway is still locked.
      expect((await (await ui("/session")).json()).unlocked).toBe(false);
    });

    test("the unlock route refuses a non-JSON body, so it is never a simple cross-site request", async () => {
      const response = await ui("/session", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "controlToken=whatever",
      });
      expect(response.status).toBe(415);
    });

    test("the correct control token exchanges for an httpOnly SameSite=Strict session", async () => {
      const response = await ui("/session", {
        method: "POST",
        body: JSON.stringify({ controlToken: token }),
      });
      expect(response.status).toBe(200);
      const setCookie = response.headers.get("set-cookie");
      expect(setCookie).toMatch(/HttpOnly/i);
      expect(setCookie).toMatch(/SameSite=Strict/i);
      expect(setCookie).toMatch(/Path=\/api\/yusuf-os-ui/i);

      const body = await response.json();
      expect(body.unlocked).toBe(true);
      expect(typeof body.csrfToken).toBe("string");
      // The control token itself is never echoed back to the browser.
      expect(JSON.stringify(body)).not.toContain(token);
    });

    test("an unlocked session can read projections, and a forged cookie cannot", async () => {
      const session = await unlock();
      const allowed = await ui("/dashboard", {
        headers: { cookie: session.cookie },
      });
      expect(allowed.status).toBe(200);

      const forged = await ui("/dashboard", {
        headers: { cookie: "yusuf_os_ui=" + "f".repeat(64) },
      });
      expect(forged.status).toBe(401);
    });

    test("state-changing requests require the double-submit request token", async () => {
      const session = await unlock();
      const withoutCsrf = await ui("/audit-integrity/check", {
        method: "POST",
        headers: { cookie: session.cookie },
      });
      expect(withoutCsrf.status).toBe(403);

      const withCsrf = await ui("/audit-integrity/check", {
        method: "POST",
        headers: { cookie: session.cookie, "x-yusuf-csrf": session.csrf },
      });
      expect(withCsrf.status).toBe(200);
    });

    test("locking ends the session immediately", async () => {
      const session = await unlock();
      const locked = await ui("/session", {
        method: "DELETE",
        headers: { cookie: session.cookie },
      });
      expect(locked.status).toBe(200);
      const after = await ui("/dashboard", {
        headers: { cookie: session.cookie },
      });
      expect(after.status).toBe(401);
    });

    test("an unconfigured control token fails closed rather than opening the gateway", async () => {
      delete process.env.YUSUF_OS_CONTROL_TOKEN;
      try {
        const response = await ui("/session", {
          method: "POST",
          body: JSON.stringify({ controlToken: "anything" }),
        });
        expect(response.status).toBe(503);
        expect((await (await ui("/session")).json()).configured).toBe(false);
      } finally {
        process.env.YUSUF_OS_CONTROL_TOKEN = token;
      }
    });
  });

  describe("uuid-addressed drilldown", () => {
    let session;
    let read;

    beforeEach(async () => {
      session = await unlock();
      read = async (path) => {
        const response = await ui(path, {
          headers: { cookie: session.cookie },
        });
        return { status: response.status, body: await response.json() };
      };
    });

    test("the roster exposes agent identity without shipping Agent instruction prose", async () => {
      const { status, body } = await read("/agents/roster");
      expect(status).toBe(200);
      expect(body.agents).toHaveLength(5);
      const chief = body.agents.find(
        (a) => a.agentId === AGENT_KEYS.CHIEF_OF_STAFF
      );
      // The Chief of Staff genuinely holds zero capabilities — that real zero
      // must survive to the UI rather than being hidden as "no data".
      expect(chief.capabilityCount).toBe(0);
      const engineering = body.agents.find(
        (a) => a.agentId === AGENT_KEYS.ENGINEERING
      );
      expect(engineering.capabilityCount).toBeGreaterThan(0);
      for (const agent of body.agents)
        expect(agent).not.toHaveProperty("instructions");
    });

    test("every id the dashboard emits is openable — the Gate F drilldown gap", async () => {
      const chief = new ChiefOfStaff(db);
      const runs = new AgentRunCoordinator(db);
      const task = await fixture.createTask({});
      const delegation = await chief.delegate({
        taskId: task.id,
        toAgentKey: AGENT_KEYS.ENGINEERING,
        requestId: randomUUID(),
      });
      await chief.markTaskRunning({ taskId: task.id });
      await runs.startRun({
        runId: delegation.run.id,
        requestId: randomUUID(),
      });

      const dashboard = (await read("/dashboard")).body;
      const taskId = dashboard.taskStatuses[0].taskId;
      const runId = dashboard.runProgress[0].runId;

      const taskDetail = await read(`/tasks/${taskId}/detail`);
      expect(taskDetail.status).toBe(200);
      expect(taskDetail.body.task.taskId).toBe(taskId);
      expect(taskDetail.body.task.ownerAgentId).toBe(AGENT_KEYS.ENGINEERING);
      // The delegation edge the constellation draws is persisted, not implied.
      expect(taskDetail.body.handoffs[0]).toMatchObject({
        fromAgentId: AGENT_KEYS.CHIEF_OF_STAFF,
        toAgentId: AGENT_KEYS.ENGINEERING,
      });
      expect(taskDetail.body.completion.gates.total).toBeGreaterThan(0);

      const runDetail = await read(`/runs/${runId}/detail`);
      expect(runDetail.status).toBe(200);
      expect(runDetail.body.run.runId).toBe(runId);
      expect(runDetail.body.task.taskId).toBe(taskId);
    });

    test("a malformed or unknown identifier fails cleanly instead of leaking internals", async () => {
      const malformed = await read("/tasks/1/detail");
      expect(malformed.status).toBe(422);
      const unknown = await read(`/tasks/${randomUUID()}/detail`);
      expect(unknown.status).toBe(404);
      expect(unknown.body.error.code).toBe("NOT_FOUND");
      expect(JSON.stringify(unknown.body)).not.toMatch(/at .*\.js:\d+/);
    });

    test("approval review exposes the decision contract without republishing the payload", async () => {
      const chief = new ChiefOfStaff(db);
      const runs = new AgentRunCoordinator(db);
      const task = await fixture.createTask({});
      const delegation = await chief.delegate({
        taskId: task.id,
        toAgentKey: AGENT_KEYS.ENGINEERING,
        requestId: randomUUID(),
      });
      await chief.markTaskRunning({ taskId: task.id });
      await runs.startRun({
        runId: delegation.run.id,
        requestId: randomUUID(),
      });

      fixture.git.git(["checkout", "-b", "feature/gate-g"]);
      fixture.git.git(["commit", "--allow-empty", "-m", "gate g change"]);
      const toolset = buildAgentToolset({
        agentKey: AGENT_KEYS.ENGINEERING,
        db,
      });
      const push = await invokeCapability({
        toolset,
        capabilityKey: "git.push_feature_branch",
        args: {
          repositoryId: fixture.repositoryUuid,
          branch: "feature/gate-g",
        },
        runtimeContext: engineeringContext(delegation.run, task),
      });
      expect(push.state).toBe("WAITING_APPROVAL");

      const dashboard = (await read("/dashboard")).body;
      expect(dashboard.approvalAttentionQueue).toHaveLength(1);
      const approvalId = dashboard.approvalAttentionQueue[0].approvalId;

      const { status, body } = await read(`/approvals/${approvalId}/review`);
      expect(status).toBe(200);

      // §8 of the API contract: capability, risk, target, policy explanation,
      // expiry, one-use behaviour, and approval-vs-execution separation.
      expect(body.approval).toMatchObject({
        approvalId,
        status: "PENDING",
        riskLevel: "L3",
        singleUse: true,
      });
      expect(body.capability.key).toBe("git.push_feature_branch");
      expect(body.policy.outcome).toBe("REQUIRE_APPROVAL");
      expect(typeof body.policy.explanation).toBe("string");
      expect(body.context.taskId).toBe(task.uuid);
      expect(body.requestedBy.agentId).toBe(AGENT_KEYS.ENGINEERING);
      // Approval is not execution: nothing has run yet.
      expect(body.execution.receiptOutcome).toBeNull();

      // The optimistic-concurrency values the existing decision route needs —
      // echoed, never invented by the client.
      expect(body.decision.decidable).toBe(true);
      expect(body.decision.expectedPayloadHash).toMatch(/^[a-f0-9]{64}$/);
      expect(body.decision.expectedIntentVersion).toBeGreaterThan(0);
      expect(body.decision.expectedApprovalVersion).toBeGreaterThan(0);

      // The canonical payload/target JSON stays server-side; only digests and
      // structured fields cross the boundary.
      expect(body).not.toHaveProperty("intent");
      const serialized = JSON.stringify(body);
      expect(serialized).not.toContain("canonicalPayload");
      expect(serialized).not.toContain("canonicalTarget");
      expect(serialized).not.toContain(token);
    });

    test("approving through the existing decision route moves real server state", async () => {
      const chief = new ChiefOfStaff(db);
      const runs = new AgentRunCoordinator(db);
      const task = await fixture.createTask({});
      const delegation = await chief.delegate({
        taskId: task.id,
        toAgentKey: AGENT_KEYS.ENGINEERING,
        requestId: randomUUID(),
      });
      await chief.markTaskRunning({ taskId: task.id });
      await runs.startRun({
        runId: delegation.run.id,
        requestId: randomUUID(),
      });
      fixture.git.git(["checkout", "-b", "feature/gate-g-decide"]);
      fixture.git.git(["commit", "--allow-empty", "-m", "gate g decide"]);
      await invokeCapability({
        toolset: buildAgentToolset({ agentKey: AGENT_KEYS.ENGINEERING, db }),
        capabilityKey: "git.push_feature_branch",
        args: {
          repositoryId: fixture.repositoryUuid,
          branch: "feature/gate-g-decide",
        },
        runtimeContext: engineeringContext(delegation.run, task),
      });

      const approvalId = (await read("/dashboard")).body
        .approvalAttentionQueue[0].approvalId;
      const review = (await read(`/approvals/${approvalId}/review`)).body;

      const decision = await ui(
        `/approvals/${review.decision.approvalRouteId}/decisions`,
        {
          method: "POST",
          headers: { cookie: session.cookie, "x-yusuf-csrf": session.csrf },
          body: JSON.stringify({
            decision: "APPROVE",
            expectedPayloadHash: review.decision.expectedPayloadHash,
            expectedIntentVersion: review.decision.expectedIntentVersion,
            expectedApprovalVersion: review.decision.expectedApprovalVersion,
          }),
        }
      );
      expect(decision.status).toBe(200);

      // APPROVED is not executed: the re-read must still show no receipt.
      const after = (await read(`/approvals/${approvalId}/review`)).body;
      expect(after.approval.status).toBe("APPROVED");
      expect(after.decision.decidable).toBe(false);
      expect(after.execution.receiptOutcome).toBeNull();
    });
  });
});
