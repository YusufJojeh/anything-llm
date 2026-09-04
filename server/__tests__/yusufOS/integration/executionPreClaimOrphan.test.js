const { randomUUID } = require("crypto");
const {
  createTestDatabase,
  clearYusufTables,
} = require("../../../__testUtils__/yusufOS/testDatabase");
const {
  IntentService,
} = require("../../../domain/yusufOS/actions/IntentService");
const { PolicyEngine } = require("../../../domain/yusufOS/policy/PolicyEngine");
const {
  ExecutionCoordinator,
} = require("../../../domain/yusufOS/execution/ExecutionCoordinator");
const {
  CareerAdapter,
} = require("../../../domain/yusufOS/adapters/career/CareerAdapter");
const {
  InboxAdapter,
} = require("../../../domain/yusufOS/adapters/inbox/InboxAdapter");

// Phase R: regression coverage for the full preflight-orphan gap in
// ExecutionCoordinator. Two distinct pre-effect failure points must both
// terminalize cleanly with no orphaned ActionIntent and no receipt, and
// always as FAILED — never FAILED_UNKNOWN, since neither point is capable
// of having caused a real external effect yet:
//   (a) adapter.prepare() throwing *after* the claim transaction (receipt
//       already exists). The cancellation case was already covered; a
//       genuine (non-abort) throw from prepare() was not, and used to be
//       misclassified as FAILED_UNKNOWN — see the two "prepare() throws"
//       tests below.
//   (b) adapter.availability()/preflight() throwing *before* the claim
//       transaction (no receipt exists yet) — the real orphan gap this
//       phase closes: previously this threw straight out of execute() with
//       the intent stranded at AUTHORIZED forever.
describe("Phase R — ExecutionCoordinator preflight-orphan regression", () => {
  let testDatabase;
  let db;

  beforeAll(async () => {
    testDatabase = await createTestDatabase();
    db = testDatabase.db;
  }, 120000);

  afterAll(async () => {
    if (testDatabase) await testDatabase.cleanup();
  });

  beforeEach(async () => clearYusufTables(db));

  async function seedCareerIntent() {
    const requestId = randomUUID();
    const agent = await db.yusuf_agents.create({
      data: {
        uuid: randomUUID(),
        key: `career-${randomUUID()}`,
        name: "Career Agent",
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
        title: "Pre-claim orphan test",
        objective: "Exercise the pre-claim failure path.",
        status: "RUNNING",
        requestId,
      },
    });
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
    await db.yusuf_agent_capabilities.create({
      data: {
        agentId: agent.id,
        capabilityKey: "career.record_opportunity",
        capabilityVersion: 1,
      },
    });
    const actionRequest = {
      principal: { type: "AGENT", id: agent.uuid },
      agentId: agent.id,
      taskId: task.id,
      runId: run.id,
      capability: "career.record_opportunity",
      resource: { type: "CAREER_OPPORTUNITY", id: "new", version: null },
      target: { account: null },
      environment: "TEST",
      payload: {
        company: "Acme",
        role: "Engineer",
        source: "referral",
        status: "RESEARCHING",
      },
    };
    const intent = await new IntentService(db).create(actionRequest, {
      requestId,
    });
    await new PolicyEngine(db).evaluate(intent.id);
    return { agent, task, run, intent, requestId };
  }

  test("availability() throwing before the claim transaction terminalizes FAILED, not FAILED_UNKNOWN, with no orphan and no receipt", async () => {
    const { intent, run, requestId } = await seedCareerIntent();
    const adapter = new CareerAdapter({ db });
    adapter.availability = async () => {
      throw new Error("simulated availability failure");
    };
    const coordinator = new ExecutionCoordinator({ db, adapter });

    await expect(coordinator.execute(intent.id, { requestId })).rejects.toThrow(
      "simulated availability failure"
    );

    const persistedIntent = await db.yusuf_action_intents.findUnique({
      where: { id: intent.id },
    });
    expect(persistedIntent.status).toBe("FAILED");
    expect(persistedIntent.status).not.toBe("FAILED_UNKNOWN");
    expect(persistedIntent.status).not.toBe("AUTHORIZED");

    const receipt = await db.yusuf_action_receipts.findUnique({
      where: { intentId: intent.id },
    });
    expect(receipt).toBeNull();

    const persistedRun = await db.yusuf_agent_runs.findUnique({
      where: { id: run.id },
    });
    expect(persistedRun.status).toBe("FAILED");

    const auditRows = await db.yusuf_audit_events.findMany({
      where: { intentRef: intent.uuid },
    });
    expect(
      auditRows.some((row) => row.eventType === "execution.preclaim_failed")
    ).toBe(true);
  });

  test("preflight() throwing before the claim transaction terminalizes FAILED with no orphan and no receipt", async () => {
    const { intent, run, requestId } = await seedCareerIntent();
    const adapter = new CareerAdapter({ db });
    adapter.preflight = async () => {
      throw new Error("simulated preflight failure");
    };
    const coordinator = new ExecutionCoordinator({ db, adapter });

    await expect(coordinator.execute(intent.id, { requestId })).rejects.toThrow(
      "simulated preflight failure"
    );

    const persistedIntent = await db.yusuf_action_intents.findUnique({
      where: { id: intent.id },
    });
    expect(persistedIntent.status).toBe("FAILED");

    const receipt = await db.yusuf_action_receipts.findUnique({
      where: { intentId: intent.id },
    });
    expect(receipt).toBeNull();

    const persistedRun = await db.yusuf_agent_runs.findUnique({
      where: { id: run.id },
    });
    expect(persistedRun.status).toBe("FAILED");
  });

  async function seedInboxIntent() {
    const requestId = randomUUID();
    const agent = await db.yusuf_agents.create({
      data: {
        uuid: randomUUID(),
        key: `inbox-${randomUUID()}`,
        name: "Inbox Agent",
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
        title: "Pre-claim orphan test (inbox)",
        objective: "Exercise the pre-claim failure path.",
        status: "RUNNING",
        requestId,
      },
    });
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
    await db.yusuf_agent_capabilities.create({
      data: {
        agentId: agent.id,
        capabilityKey: "inbox.record_message",
        capabilityVersion: 1,
      },
    });
    const actionRequest = {
      principal: { type: "AGENT", id: agent.uuid },
      agentId: agent.id,
      taskId: task.id,
      runId: run.id,
      capability: "inbox.record_message",
      resource: { type: "INBOX_MESSAGE", id: "new", version: null },
      target: { account: null },
      environment: "TEST",
      payload: {
        fromAddress: "someone@example.com",
        subject: "Test",
        bodyText: "hello",
      },
    };
    const intent = await new IntentService(db).create(actionRequest, {
      requestId,
    });
    await new PolicyEngine(db).evaluate(intent.id);
    return { agent, task, run, intent, requestId };
  }

  test("Inbox adapter: availability() throwing before the claim transaction terminalizes cleanly with no orphan", async () => {
    const { intent, run, requestId } = await seedInboxIntent();
    const adapter = new InboxAdapter({ db });
    adapter.availability = async () => {
      throw new Error("simulated inbox availability failure");
    };
    const coordinator = new ExecutionCoordinator({ db, adapter });

    await expect(coordinator.execute(intent.id, { requestId })).rejects.toThrow(
      "simulated inbox availability failure"
    );

    const persistedIntent = await db.yusuf_action_intents.findUnique({
      where: { id: intent.id },
    });
    expect(persistedIntent.status).toBe("FAILED");

    const receipt = await db.yusuf_action_receipts.findUnique({
      where: { intentId: intent.id },
    });
    expect(receipt).toBeNull();

    const persistedRun = await db.yusuf_agent_runs.findUnique({
      where: { id: run.id },
    });
    expect(persistedRun.status).toBe("FAILED");
  });

  test.each(["availability", "preflight"])(
    "cancellation aborts a never-settling %s stage before claim without an orphan",
    async (stage) => {
      const { intent, run, requestId } = await seedCareerIntent();
      const adapter = new CareerAdapter({ db });
      let entered;
      const stageEntered = new Promise((resolve) => {
        entered = resolve;
      });
      adapter[stage] = jest.fn(() => {
        entered();
        return new Promise(() => {});
      });
      const controller = new AbortController();
      const executing = new ExecutionCoordinator({ db, adapter }).execute(
        intent.id,
        { requestId, signal: controller.signal }
      );
      await stageEntered;
      controller.abort();
      await expect(executing).rejects.toMatchObject({ code: "CONFLICT" });
      expect(
        await db.yusuf_action_intents.findUnique({ where: { id: intent.id } })
      ).toMatchObject({ status: "FAILED" });
      expect(
        await db.yusuf_agent_runs.findUnique({ where: { id: run.id } })
      ).toMatchObject({ status: "FAILED" });
      expect(
        await db.yusuf_action_receipts.findUnique({
          where: { intentId: intent.id },
        })
      ).toBeNull();
    }
  );

  test("cancellation aborts a never-settling prepare stage as definitely not applied", async () => {
    const { intent, run, requestId } = await seedCareerIntent();
    const adapter = new CareerAdapter({ db });
    let entered;
    const stageEntered = new Promise((resolve) => {
      entered = resolve;
    });
    adapter.prepare = jest.fn(() => {
      entered();
      return new Promise(() => {});
    });
    const controller = new AbortController();
    const executing = new ExecutionCoordinator({ db, adapter }).execute(
      intent.id,
      { requestId, signal: controller.signal }
    );
    await stageEntered;
    controller.abort();
    await expect(executing).resolves.toMatchObject({
      outcome: "FAILED",
      verificationStatus: "NOT_APPLIED",
    });
    expect(
      await db.yusuf_action_intents.findUnique({ where: { id: intent.id } })
    ).toMatchObject({ status: "FAILED" });
    expect(
      await db.yusuf_agent_runs.findUnique({ where: { id: run.id } })
    ).toMatchObject({ status: "FAILED" });
  });

  test("prepare() throwing a genuine (non-abort) error terminalizes FAILED, not FAILED_UNKNOWN", async () => {
    const { intent, run, requestId } = await seedCareerIntent();
    const adapter = new CareerAdapter({ db });
    adapter.prepare = jest.fn(() => {
      throw new Error("adapter bug: prepare() blew up");
    });
    const result = await new ExecutionCoordinator({ db, adapter }).execute(
      intent.id,
      { requestId }
    );
    expect(result).toMatchObject({
      outcome: "FAILED",
      verificationStatus: "NOT_APPLIED",
    });
    expect(
      await db.yusuf_action_intents.findUnique({ where: { id: intent.id } })
    ).toMatchObject({ status: "FAILED" });
    expect(
      await db.yusuf_agent_runs.findUnique({ where: { id: run.id } })
    ).toMatchObject({ status: "FAILED" });
  });

  test("prepare() rejecting with an async error terminalizes FAILED, not FAILED_UNKNOWN", async () => {
    const { intent, run, requestId } = await seedCareerIntent();
    const adapter = new CareerAdapter({ db });
    adapter.prepare = jest
      .fn()
      .mockRejectedValue(new Error("adapter bug: async prepare() rejected"));
    const result = await new ExecutionCoordinator({ db, adapter }).execute(
      intent.id,
      { requestId }
    );
    expect(result).toMatchObject({
      outcome: "FAILED",
      verificationStatus: "NOT_APPLIED",
    });
    expect(
      await db.yusuf_action_intents.findUnique({ where: { id: intent.id } })
    ).toMatchObject({ status: "FAILED" });
    expect(
      await db.yusuf_agent_runs.findUnique({ where: { id: run.id } })
    ).toMatchObject({ status: "FAILED" });
  });

  test("cancellation aborts a never-settling verify stage as unknown after effect", async () => {
    const { intent, run, requestId } = await seedCareerIntent();
    const adapter = new CareerAdapter({ db });
    adapter.execute = jest.fn().mockResolvedValue({
      outcome: "SUCCEEDED",
      externalReference: "test:effect-applied",
      result: { digest: "applied-digest" },
    });
    let entered;
    const stageEntered = new Promise((resolve) => {
      entered = resolve;
    });
    adapter.verify = jest.fn(() => {
      entered();
      return new Promise(() => {});
    });
    const controller = new AbortController();
    const executing = new ExecutionCoordinator({ db, adapter }).execute(
      intent.id,
      { requestId, signal: controller.signal }
    );
    await stageEntered;
    controller.abort();
    await expect(executing).resolves.toMatchObject({
      outcome: "UNKNOWN",
      verificationStatus: "UNKNOWN",
    });
    expect(
      await db.yusuf_action_intents.findUnique({ where: { id: intent.id } })
    ).toMatchObject({ status: "FAILED_UNKNOWN" });
    expect(
      await db.yusuf_agent_runs.findUnique({ where: { id: run.id } })
    ).toMatchObject({ status: "FAILED_UNKNOWN" });
  });
});
