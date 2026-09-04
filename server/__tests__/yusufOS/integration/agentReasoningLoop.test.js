const { randomUUID } = require("crypto");
const {
  createTestDatabase,
  clearYusufTables,
} = require("../../../__testUtils__/yusufOS/testDatabase");
const {
  createAgentFixture,
} = require("../../../__testUtils__/yusufOS/agentFixture");
const {
  AgentReasoningLoop,
} = require("../../../domain/yusufOS/agents/AgentReasoningLoop");
const {
  AgentRunCoordinator,
} = require("../../../domain/yusufOS/agents/AgentRunCoordinator");
const {
  DeterministicModelClient,
} = require("../../../domain/yusufOS/agents/ModelClient");
const {
  buildAgentToolset,
} = require("../../../domain/yusufOS/agents/toolBinding");
const {
  YusufActionBoundary,
} = require("../../../domain/yusufOS/runtime/YusufActionBoundary");
const {
  IntentService,
} = require("../../../domain/yusufOS/actions/IntentService");
const {
  PolicyEngine,
} = require("../../../domain/yusufOS/policy/PolicyEngine");
const {
  ExecutionCoordinator,
} = require("../../../domain/yusufOS/execution/ExecutionCoordinator");
const {
  CareerAdapter,
} = require("../../../domain/yusufOS/adapters/career/CareerAdapter");
const {
  HandoffService,
} = require("../../../domain/yusufOS/handoffs/HandoffService");

describe("Phase T — real Agent reasoning loop", () => {
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

  afterEach(() => fixture?.cleanup());

  async function careerRun() {
    const task = await fixture.createTask({
      objective: "Record Acme's backend role, then inspect the pipeline.",
    });
    await db.yusuf_tasks.update({
      where: { id: task.id },
      data: { assignedAgentId: fixture.career.id, status: "RUNNING" },
    });
    const run = await db.yusuf_agent_runs.create({
      data: {
        uuid: randomUUID(),
        taskId: task.id,
        agentId: fixture.career.id,
        requestedByPrincipalType: "AGENT",
        requestedByPrincipalId: fixture.chief.uuid,
        status: "RUNNING",
        runKind: "IMPLEMENTATION",
        requestId: randomUUID(),
        startedAt: new Date(),
      },
    });
    return { task, run };
  }

  test("the deterministic model selects governed capabilities, sees results, and ends only its run", async () => {
    const { task, run } = await careerRun();
    const model = new DeterministicModelClient({
      "career:reasoning": [
        {
          type: "CALL_CAPABILITY",
          capability: "career.record_opportunity",
          arguments: { company: "Acme", role: "Backend Engineer" },
          reason: "Record the opportunity.",
          expectedOutcome: "A RESEARCHING opportunity.",
        },
        ({ prompt }) => {
          expect(prompt).toContain("Acme");
          expect(prompt).toContain("VERIFIED");
          return {
            type: "CALL_CAPABILITY",
            capability: "career.read_opportunities",
            arguments: { status: "RESEARCHING" },
            reason: "Verify it is in the pipeline.",
            expectedOutcome: "The recorded opportunity.",
          };
        },
        {
          type: "COMPLETE",
          summary: "Opportunity recorded and read back.",
          evidenceRefs: [],
        },
      ],
    });

    const result = await new AgentReasoningLoop({ db, modelClient: model }).execute({
      runId: run.id,
    });
    expect(result).toMatchObject({
      outcome: "COMPLETED",
      steps: 3,
      toolCalls: 2,
    });
    expect(await db.yusuf_career_opportunities.count()).toBe(1);
    expect(
      await db.yusuf_action_intents.count({ where: { runId: run.id } })
    ).toBe(2);
    expect(
      (await db.yusuf_agent_runs.findUnique({ where: { id: run.id } })).status
    ).toBe("COMPLETED");
    expect(
      (await db.yusuf_tasks.findUnique({ where: { id: task.id } })).status
    ).toBe("RUNNING");
  });

  test("a repeated identical call is refused before a second dispatch", async () => {
    const { run } = await careerRun();
    const call = {
      type: "CALL_CAPABILITY",
      capability: "career.read_opportunities",
      arguments: { status: "RESEARCHING" },
      reason: "Read.",
      expectedOutcome: "List.",
    };
    const model = new DeterministicModelClient({
      "career:reasoning": [call, call],
    });
    await expect(
      new AgentReasoningLoop({ db, modelClient: model }).execute({ runId: run.id })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(
      await db.yusuf_action_intents.count({ where: { runId: run.id } })
    ).toBe(1);
  });

  test("an exclusive durable lease permits only one concurrent reasoning stream", async () => {
    const { run } = await careerRun();
    let releaseCompletion;
    const entered = new Promise((resolve) => {
      releaseCompletion = resolve;
    });
    let announceEntered;
    const modelEntered = new Promise((resolve) => {
      announceEntered = resolve;
    });
    const model = {
      calls: 0,
      async complete() {
        this.calls += 1;
        announceEntered();
        await entered;
        return {
          content: JSON.stringify({
            type: "COMPLETE",
            summary: "One owner completed the turn.",
            evidenceRefs: [],
          }),
        };
      },
    };
    const loop = new AgentReasoningLoop({ db, modelClient: model });
    const first = loop.execute({ runId: run.id });
    await modelEntered;
    await expect(loop.execute({ runId: run.id })).rejects.toMatchObject({
      code: "CONFLICT",
      details: { reason: "REASONING_LEASE_HELD" },
    });
    releaseCompletion();
    await expect(first).resolves.toMatchObject({ outcome: "COMPLETED" });
    expect(model.calls).toBe(1);
    const persisted = await db.yusuf_agent_runs.findUnique({
      where: { id: run.id },
    });
    expect(JSON.parse(persisted.reasoningState)).toMatchObject({ steps: 1 });
    expect(persisted.reasoningLeaseId).toBeNull();
  });

  test("concurrent callers racing to start one queued run cannot fail the winner", async () => {
    const { run } = await careerRun();
    await db.yusuf_agent_runs.update({
      where: { id: run.id },
      data: { status: "QUEUED", startedAt: null },
    });
    const coordinator = new AgentRunCoordinator(db);
    const startRun = coordinator.startRun.bind(coordinator);
    let entrants = 0;
    let releaseStarts;
    const bothEntered = new Promise((resolve) => {
      releaseStarts = resolve;
    });
    coordinator.startRun = async (args) => {
      entrants += 1;
      if (entrants === 2) releaseStarts();
      await bothEntered;
      return startRun(args);
    };
    const model = new DeterministicModelClient({
      "career:reasoning": {
        type: "COMPLETE",
        summary: "The lease winner completed.",
        evidenceRefs: [],
      },
    });
    const loop = new AgentReasoningLoop({
      db,
      modelClient: model,
      runCoordinator: coordinator,
    });
    const outcomes = await Promise.allSettled([
      loop.execute({ runId: run.id }),
      loop.execute({ runId: run.id }),
    ]);
    if (!outcomes.some(({ status }) => status === "fulfilled"))
      throw new Error(
        outcomes
          .map(({ reason }) => `${reason?.code || "ERROR"}: ${reason?.message}`)
          .join(" | ")
      );
    expect(outcomes.filter(({ status }) => status === "fulfilled")).toHaveLength(
      1
    );
    expect(outcomes.filter(({ status }) => status === "rejected")).toHaveLength(
      1
    );
    expect(model.calls).toHaveLength(1);
    expect(
      await db.yusuf_agent_runs.findUnique({ where: { id: run.id } })
    ).toMatchObject({ status: "COMPLETED" });
  });

  test("two different queued runs for the same agent cannot both pass the concurrency cap", async () => {
    // Distinct from the race above: that one races two callers on the SAME
    // run id (already guarded by the row's own version). This races two
    // DIFFERENT QUEUED runs for one agent against the aggregate
    // maxConcurrentRuns count, which used to be a separate count() and a
    // separate conditional update — two racing callers could both read the
    // same "0 active" count and both win their own row's transition.
    const { run: runA } = await careerRun();
    await db.yusuf_agent_runs.update({
      where: { id: runA.id },
      data: { status: "QUEUED", startedAt: null },
    });
    const taskB = await fixture.createTask({
      objective: "Track a second, unrelated career opportunity.",
    });
    await db.yusuf_tasks.update({
      where: { id: taskB.id },
      data: { assignedAgentId: fixture.career.id, status: "RUNNING" },
    });
    const runB = await db.yusuf_agent_runs.create({
      data: {
        uuid: randomUUID(),
        taskId: taskB.id,
        agentId: fixture.career.id,
        requestedByPrincipalType: "AGENT",
        requestedByPrincipalId: fixture.chief.uuid,
        status: "QUEUED",
        runKind: "IMPLEMENTATION",
        requestId: randomUUID(),
      },
    });

    const coordinator = new AgentRunCoordinator(db);
    const startRun = coordinator.startRun.bind(coordinator);
    let entrants = 0;
    let releaseStarts;
    const bothEntered = new Promise((resolve) => {
      releaseStarts = resolve;
    });
    coordinator.startRun = async (args) => {
      entrants += 1;
      if (entrants === 2) releaseStarts();
      await bothEntered;
      return startRun(args);
    };

    const outcomes = await Promise.allSettled([
      coordinator.startRun({ runId: runA.id }),
      coordinator.startRun({ runId: runB.id }),
    ]);

    // The security-relevant invariant is that the cap is never exceeded, not
    // the exact shape of the loser's error: under real contention on this
    // project's single-connection SQLite setup, the loser may see a clean
    // CONFLICT from the concurrency check, or the underlying connector may
    // itself refuse the second concurrent write transaction outright. Both
    // are safe (fail closed, no double-start); only the count matters here.
    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((o) => o.status === "rejected")).toHaveLength(1);
    const runningCount = await db.yusuf_agent_runs.count({
      where: { agentId: fixture.career.id, status: "RUNNING" },
    });
    expect(runningCount).toBe(1);
  });

  test("a stale lease owner cannot terminalize the current owner's run", async () => {
    const { run } = await careerRun();
    await db.yusuf_agent_runs.update({
      where: { id: run.id },
      data: {
        reasoningLeaseId: "new-owner",
        reasoningLeaseExpiresAt: new Date(Date.now() + 60000),
      },
    });
    const changed = await new AgentRunCoordinator(
      db
    ).terminalizeReasoningFailure({
      runId: run.id,
      leaseId: "expired-old-owner",
      cancelled: false,
      failureKind: "AGENT_REASONING",
      message: "stale failure",
    });
    expect(changed).toBe(false);
    expect(
      await db.yusuf_agent_runs.findUnique({ where: { id: run.id } })
    ).toMatchObject({ status: "RUNNING", reasoningLeaseId: "new-owner" });
  });

  test("cancelling an in-flight model completion never launches retries", async () => {
    const { run } = await careerRun();
    let entered;
    const modelEntered = new Promise((resolve) => {
      entered = resolve;
    });
    const model = {
      calls: 0,
      async complete() {
        this.calls += 1;
        entered();
        return new Promise(() => {});
      },
    };
    const controller = new AbortController();
    const execution = new AgentReasoningLoop({ db, modelClient: model }).execute({
      runId: run.id,
      signal: controller.signal,
    });
    await modelEntered;
    controller.abort();
    await expect(execution).rejects.toMatchObject({ code: "CONFLICT" });
    expect(model.calls).toBe(1);
    expect(
      await db.yusuf_agent_runs.findUnique({ where: { id: run.id } })
    ).toMatchObject({ status: "CANCELLED" });
  });

  test("unavailable token telemetry is conservatively charged across steps", async () => {
    const { run } = await careerRun();
    const decision = JSON.stringify({
      type: "CALL_CAPABILITY",
      capability: "career.read_opportunities",
      arguments: { status: "RESEARCHING" },
      reason: "Read.",
      expectedOutcome: "List.",
    });
    const promptAssembler = {
      assembleMessages: () => [{ role: "system", content: "x" }],
    };
    const promptBytes = Buffer.byteLength(
      JSON.stringify(promptAssembler.assembleMessages()),
      "utf8"
    );
    const model = {
      calls: 0,
      async complete() {
        this.calls += 1;
        return {
          content: decision,
          usage: { confidence: "UNAVAILABLE" },
        };
      },
    };
    await expect(
      new AgentReasoningLoop({ db, modelClient: model, promptAssembler }).execute({
        runId: run.id,
        limits: {
          maxModelTokens: promptBytes + Buffer.byteLength(decision, "utf8"),
        },
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(model.calls).toBe(1);
    expect(await db.yusuf_action_intents.count({ where: { runId: run.id } })).toBe(
      1
    );
  });

  test("context length is a dynamic routed requirement derived from the prompt budget", async () => {
    const { run } = await careerRun();
    let requiredCapabilities;
    const model = {
      async complete(args) {
        requiredCapabilities = args.requiredCapabilities;
        return {
          content: JSON.stringify({
            type: "COMPLETE",
            summary: "Done.",
            evidenceRefs: [],
          }),
          usage: { totalTokens: 1 },
        };
      },
    };
    await new AgentReasoningLoop({ db, modelClient: model }).execute({
      runId: run.id,
    });
    expect(requiredCapabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capability: "context_length",
          minimum: expect.any(Number),
        }),
      ])
    );
  });

  test("lease recovery cannot reset the persisted wall-clock deadline", async () => {
    const { run } = await careerRun();
    await db.yusuf_agent_runs.update({
      where: { id: run.id },
      data: {
        reasoningState: JSON.stringify({ startedAtMs: Date.now() - 1000 }),
        reasoningLeaseId: "expired-owner",
        reasoningLeaseExpiresAt: new Date(Date.now() - 100),
      },
    });
    const model = { calls: 0, complete: jest.fn() };
    await expect(
      new AgentReasoningLoop({ db, modelClient: model }).execute({
        runId: run.id,
        limits: { maxWallClockMs: 100 },
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(model.complete).not.toHaveBeenCalled();
    expect(
      await db.yusuf_agent_runs.findUnique({ where: { id: run.id } })
    ).toMatchObject({ status: "FAILED" });
  });

  test("a model cannot use an ungranted capability", async () => {
    const { run } = await careerRun();
    const model = new DeterministicModelClient({
      "career:reasoning": [
        {
          type: "CALL_CAPABILITY",
          capability: "git.push_feature_branch",
          arguments: { branch: "main" },
          reason: "Attempt escalation.",
          expectedOutcome: "Push.",
        },
        {
          type: "COMPLETE",
          summary: "Escalation was denied.",
          evidenceRefs: [],
        },
      ],
    });
    const result = await new AgentReasoningLoop({ db, modelClient: model }).execute({
      runId: run.id,
    });
    expect(result.outcome).toBe("COMPLETED");
    expect(await db.yusuf_action_intents.count()).toBe(0);
  });

  test("malformed model output fails the run as a contract violation", async () => {
    const { run } = await careerRun();
    const model = new DeterministicModelClient({
      "career:reasoning": "```json\n{\"type\":\"COMPLETE\"}\n```",
    });
    await expect(
      new AgentReasoningLoop({ db, modelClient: model }).execute({ runId: run.id })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(
      await db.yusuf_agent_runs.findUnique({ where: { id: run.id } })
    ).toMatchObject({ status: "FAILED", failureKind: "CONTRACT_VIOLATION" });
    expect(await db.yusuf_action_intents.count()).toBe(0);
  });

  test("COMPLETE cannot forge an evidence reference", async () => {
    const { run } = await careerRun();
    const model = new DeterministicModelClient({
      "career:reasoning": {
        type: "COMPLETE",
        summary: "Claimed proof.",
        evidenceRefs: [randomUUID()],
      },
    });
    await expect(
      new AgentReasoningLoop({ db, modelClient: model }).execute({ runId: run.id })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(
      await db.yusuf_agent_runs.findUnique({ where: { id: run.id } })
    ).toMatchObject({ status: "FAILED", failureKind: "CONTRACT_VIOLATION" });
  });

  test("a stale run cannot reason after task ownership changes", async () => {
    const { run, task } = await careerRun();
    await db.yusuf_tasks.update({
      where: { id: task.id },
      data: { assignedAgentId: fixture.engineering.id },
    });
    const model = new DeterministicModelClient({
      "career:reasoning": {
        type: "COMPLETE",
        summary: "stale",
        evidenceRefs: [],
      },
    });
    await expect(
      new AgentReasoningLoop({ db, modelClient: model }).execute({ runId: run.id })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(model.calls).toHaveLength(0);
  });

  test("an AbortSignal cancels before any model or capability call", async () => {
    const { run } = await careerRun();
    const model = new DeterministicModelClient({
      "career:reasoning": {
        type: "COMPLETE",
        summary: "should not run",
        evidenceRefs: [],
      },
    });
    const controller = new AbortController();
    controller.abort();
    await expect(
      new AgentReasoningLoop({ db, modelClient: model }).execute({
        runId: run.id,
        signal: controller.signal,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(model.calls).toHaveLength(0);
    expect(
      (await db.yusuf_agent_runs.findUnique({ where: { id: run.id } })).status
    ).toBe("CANCELLED");
  });

  test("the wall-clock budget aborts even a model client that never settles", async () => {
    const { run } = await careerRun();
    const model = {
      calls: 0,
      complete() {
        this.calls += 1;
        return new Promise(() => {});
      },
    };
    await expect(
      new AgentReasoningLoop({ db, modelClient: model }).execute({
        runId: run.id,
        limits: { maxWallClockMs: 25, maxRetryCount: 0 },
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(model.calls).toBe(1);
    expect(
      await db.yusuf_agent_runs.findUnique({ where: { id: run.id } })
    ).toMatchObject({ status: "FAILED", failureKind: "AGENT_REASONING" });
  });

  test("an exact token budget blocks the next completion before overspend", async () => {
    const { run } = await careerRun();
    const model = {
      calls: 0,
      async complete() {
        this.calls += 1;
        return {
          content: JSON.stringify({
            type: "CALL_CAPABILITY",
            capability: "career.read_opportunities",
            arguments: { status: "RESEARCHING" },
            reason: "Read.",
            expectedOutcome: "List.",
          }),
          usage: {
            confidence: "KNOWN",
            promptTokens: 2,
            completionTokens: 1,
            totalTokens: 3,
          },
        };
      },
    };
    const promptAssembler = {
      assembleMessages: () => [
        { role: "system", content: "x" },
        { role: "user", content: "y" },
      ],
    };
    const promptReservation = Buffer.byteLength(
      JSON.stringify(promptAssembler.assembleMessages()),
      "utf8"
    );
    await expect(
      new AgentReasoningLoop({ db, modelClient: model, promptAssembler }).execute({
        runId: run.id,
        limits: { maxModelTokens: promptReservation + 3 },
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(model.calls).toBe(1);
    expect(await db.yusuf_action_intents.count({ where: { runId: run.id } })).toBe(
      1
    );
  });

  test("cancellation during adapter execution becomes FAILED_UNKNOWN and no second action runs", async () => {
    const { run } = await careerRun();
    const adapter = new CareerAdapter({ db });
    let entered;
    const executeEntered = new Promise((resolve) => {
      entered = resolve;
    });
    adapter.execute = jest.fn(() => {
      entered();
      return new Promise(() => {});
    });
    const boundary = new YusufActionBoundary({
      intentService: new IntentService(db),
      policyEngine: new PolicyEngine(db),
      executionCoordinatorFactory: () =>
        new ExecutionCoordinator({ db, adapter }),
    });
    const model = new DeterministicModelClient({
      "career:reasoning": [
        {
          type: "CALL_CAPABILITY",
          capability: "career.record_opportunity",
          arguments: { company: "Acme", role: "Backend Engineer" },
          reason: "Record.",
          expectedOutcome: "Created.",
        },
        {
          type: "COMPLETE",
          summary: "must never run",
          evidenceRefs: [],
        },
      ],
    });
    const controller = new AbortController();
    const execution = new AgentReasoningLoop({
        db,
        modelClient: model,
        buildToolset: ({ agentKey }) =>
          buildAgentToolset({ agentKey, db, actionBoundary: boundary }),
      }).execute({
        runId: run.id,
        signal: controller.signal,
        limits: { maxWallClockMs: 5000, maxRetryCount: 0 },
      });
    await executeEntered;
    controller.abort();
    await expect(execution).rejects.toMatchObject({
      code: "INVALID_STATE_TRANSITION",
    });
    expect(model.calls).toHaveLength(1);
    expect(adapter.execute).toHaveBeenCalledTimes(1);
    expect(
      await db.yusuf_agent_runs.findUnique({ where: { id: run.id } })
    ).toMatchObject({ status: "FAILED_UNKNOWN" });
    expect(await db.yusuf_action_intents.findFirst({ where: { runId: run.id } })).toMatchObject(
      { status: "FAILED_UNKNOWN" }
    );
  });

  test("Chief of Staff may hand a task to a code-allowed specialist without inheriting capabilities", async () => {
    const task = await fixture.createTask({ objective: "Track a career lead." });
    await db.yusuf_tasks.update({
      where: { id: task.id },
      data: { assignedAgentId: fixture.chief.id, status: "RUNNING" },
    });
    const run = await db.yusuf_agent_runs.create({
      data: {
        uuid: randomUUID(),
        taskId: task.id,
        agentId: fixture.chief.id,
        requestedByPrincipalType: "USER",
        requestedByPrincipalId: "yusuf",
        status: "RUNNING",
        runKind: "ORCHESTRATION",
        requestId: randomUUID(),
        startedAt: new Date(),
      },
    });
    const model = new DeterministicModelClient({
      "chief_of_staff:reasoning": {
        type: "HANDOFF",
        targetAgent: "career",
        reason: "Career owns opportunity tracking.",
      },
    });
    const result = await new AgentReasoningLoop({ db, modelClient: model }).execute({
      runId: run.id,
    });
    expect(result).toMatchObject({ outcome: "WAITING_HANDOFF", handoffs: 1 });
    expect(
      await db.yusuf_agent_runs.findUnique({ where: { uuid: result.nextRunId } })
    ).toMatchObject({ agentId: fixture.career.id, status: "QUEUED" });
    expect(
      (await db.yusuf_tasks.findUnique({ where: { id: task.id } })).assignedAgentId
    ).toBe(fixture.career.id);
    expect(await db.yusuf_action_intents.count({ where: { runId: run.id } })).toBe(
      0
    );
  });

  test("an independently routed Reviewer completion is the authoritative persisted verdict", async () => {
    const task = await fixture.createTask({ objective: "Review the target run." });
    const sourceRun = await db.yusuf_agent_runs.create({
      data: {
        uuid: randomUUID(),
        taskId: task.id,
        agentId: fixture.engineering.id,
        requestedByPrincipalType: "USER",
        requestedByPrincipalId: "yusuf",
        status: "WAITING_HANDOFF",
        runKind: "IMPLEMENTATION",
        requestId: randomUUID(),
        startedAt: new Date(),
      },
    });
    await db.yusuf_tasks.update({
      where: { id: task.id },
      data: { assignedAgentId: fixture.reviewer.id, status: "RUNNING" },
    });
    const run = await db.yusuf_agent_runs.create({
      data: {
        uuid: randomUUID(),
        taskId: task.id,
        agentId: fixture.reviewer.id,
        requestedByPrincipalType: "AGENT",
        requestedByPrincipalId: fixture.chief.uuid,
        status: "RUNNING",
        runKind: "REVIEW",
        requestId: randomUUID(),
        startedAt: new Date(),
      },
    });
    const handoffService = new HandoffService(db);
    const handoff = await handoffService.create({
      taskId: task.id,
      fromAgentId: fixture.engineering.id,
      toAgentId: fixture.reviewer.id,
      fromRunId: sourceRun.id,
      reason: "INDEPENDENT_REVIEW",
      actingAgentId: fixture.engineering.id,
      requestId: randomUUID(),
    });
    await handoffService.accept({
      handoffId: handoff.id,
      acceptingAgentId: fixture.reviewer.id,
      toRunId: run.id,
      requestId: randomUUID(),
    });
    let receivedPolicy;
    const routed = {
      provider: "OPENAI",
      model: "reviewer-model-v1",
      requestedModel: "reviewer-model-v1",
      modelMismatch: false,
      policy: "EXPLICIT_MODEL",
      fallbackOccurred: false,
      latencyMs: 5,
      usage: {
        confidence: "KNOWN",
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      },
      cost: { confidence: "UNAVAILABLE", amountMicros: null },
    };
    const model = {
      async complete(args) {
        receivedPolicy = args.modelPolicy;
        return {
          content: JSON.stringify({
            type: "REVIEW_VERDICT",
            verdict: "PASS",
            summary: "Evidence supports the implementation.",
            findings: [],
          }),
          routed,
          usage: routed.usage,
        };
      },
    };
    const priorProvider = process.env.YUSUF_OS_REVIEWER_MODEL_PROVIDER;
    const priorModel = process.env.YUSUF_OS_REVIEWER_MODEL_ID;
    process.env.YUSUF_OS_REVIEWER_MODEL_PROVIDER = "OPENAI";
    process.env.YUSUF_OS_REVIEWER_MODEL_ID = "reviewer-model-v1";
    try {
      const result = await new AgentReasoningLoop({
        db,
        modelClient: model,
      }).execute({ runId: run.id });
      expect(result).toMatchObject({
        outcome: "COMPLETED",
        reviewVerdict: "PASS",
      });
      expect(receivedPolicy).toMatchObject({
        explicitProvider: "OPENAI",
        explicitModel: "reviewer-model-v1",
      });
    } finally {
      if (priorProvider === undefined)
        delete process.env.YUSUF_OS_REVIEWER_MODEL_PROVIDER;
      else process.env.YUSUF_OS_REVIEWER_MODEL_PROVIDER = priorProvider;
      if (priorModel === undefined) delete process.env.YUSUF_OS_REVIEWER_MODEL_ID;
      else process.env.YUSUF_OS_REVIEWER_MODEL_ID = priorModel;
    }
    expect(await db.yusuf_review_verdicts.findFirst()).toMatchObject({
      reviewRunId: run.id,
      verdict: "PASS",
    });
    expect(
      await db.yusuf_handoffs.findUnique({ where: { id: handoff.id } })
    ).toMatchObject({ status: "COMPLETED" });
    const persistedRun = await db.yusuf_agent_runs.findUnique({
      where: { id: run.id },
    });
    expect(persistedRun).toMatchObject({ status: "COMPLETED" });
    expect(JSON.parse(persistedRun.modelRef)).toMatchObject({
      telemetryKind: "ROUTED_COMPLETION",
      provider: "OPENAI",
      model: "reviewer-model-v1",
    });
  });
});
