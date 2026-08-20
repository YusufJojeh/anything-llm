const { randomUUID } = require("crypto");
const {
  createTestDatabase,
  clearYusufTables,
} = require("../../../__testUtils__/yusufOS/testDatabase");
const { createAgentFixture } = require("../../../__testUtils__/yusufOS/agentFixture");
const {
  AGENT_KEYS,
  RUN_KINDS,
  RUN_STATUSES,
  REVIEW_VERDICTS,
  TASK_STATUSES,
} = require("../../../domain/yusufOS/constants");
const {
  MUTATION_CAPABILITIES,
  getAgentDefinition,
} = require("../../../domain/yusufOS/agents/definitions");
const {
  assertGrantAllowed,
} = require("../../../domain/yusufOS/agents/AgentRegistry");
const {
  buildAgentToolset,
  invokeCapability,
} = require("../../../domain/yusufOS/agents/toolBinding");
const { ReviewService } = require("../../../domain/yusufOS/review/ReviewService");
const { HandoffService } = require("../../../domain/yusufOS/handoffs/HandoffService");
const { ChiefOfStaff } = require("../../../domain/yusufOS/orchestration/ChiefOfStaff");
const {
  AgentRunCoordinator,
} = require("../../../domain/yusufOS/agents/AgentRunCoordinator");
const contracts = require("../../../domain/yusufOS/agents/contracts");
const { HARD_FORBIDDEN } = require("../../../domain/yusufOS/capabilities/registry");

describe("Gate E — agent capability isolation", () => {
  test("Reviewer holds no mutation capability at the role-definition level", () => {
    const reviewer = getAgentDefinition(AGENT_KEYS.REVIEWER);
    for (const capability of reviewer.allowedCapabilities) {
      expect(MUTATION_CAPABILITIES).not.toContain(capability);
    }
  });

  test("Chief of Staff holds no capabilities at all — delegation grants no authority", () => {
    const chief = getAgentDefinition(AGENT_KEYS.CHIEF_OF_STAFF);
    expect(chief.allowedCapabilities).toEqual([]);
  });

  test("Engineering holds the write capabilities, proving the roles really differ", () => {
    const engineering = getAgentDefinition(AGENT_KEYS.ENGINEERING);
    expect(engineering.allowedCapabilities).toContain("project.write_file");
    expect(engineering.allowedCapabilities).toContain("git.commit_local");
  });

  test.each([
    [AGENT_KEYS.REVIEWER, "project.write_file"],
    [AGENT_KEYS.REVIEWER, "git.commit_local"],
    [AGENT_KEYS.REVIEWER, "git.push_feature_branch"],
    [AGENT_KEYS.CHIEF_OF_STAFF, "project.write_file"],
    [AGENT_KEYS.CHIEF_OF_STAFF, "git.push_feature_branch"],
    [AGENT_KEYS.REVIEWER, "knowledge.write"],
    [AGENT_KEYS.REVIEWER, "memory.write"],
    [AGENT_KEYS.CHIEF_OF_STAFF, "memory.write"],
    [AGENT_KEYS.CHIEF_OF_STAFF, "knowledge.write"],
    [AGENT_KEYS.REVIEWER, "monitoring.record_check"],
    [AGENT_KEYS.ENGINEERING, "monitoring.record_check"],
    [AGENT_KEYS.CHIEF_OF_STAFF, "monitoring.record_check"],
    [AGENT_KEYS.MONITORING, "project.write_file"],
    [AGENT_KEYS.MONITORING, "git.commit_local"],
    [AGENT_KEYS.MONITORING, "git.push_feature_branch"],
    [AGENT_KEYS.MONITORING, "browser.submit_form"],
    [AGENT_KEYS.MONITORING, "memory.write"],
    [AGENT_KEYS.REVIEWER, "career.update_status"],
    [AGENT_KEYS.ENGINEERING, "career.update_status"],
    [AGENT_KEYS.CHIEF_OF_STAFF, "career.update_status"],
    [AGENT_KEYS.MONITORING, "career.record_opportunity"],
    [AGENT_KEYS.CAREER, "project.write_file"],
    [AGENT_KEYS.CAREER, "git.commit_local"],
    [AGENT_KEYS.CAREER, "git.push_feature_branch"],
    [AGENT_KEYS.CAREER, "browser.submit_form"],
    [AGENT_KEYS.CAREER, "memory.write"],
    [AGENT_KEYS.CAREER, "monitoring.record_check"],
    [AGENT_KEYS.REVIEWER, "marketing.update_status"],
    [AGENT_KEYS.ENGINEERING, "marketing.update_status"],
    [AGENT_KEYS.CHIEF_OF_STAFF, "marketing.update_status"],
    [AGENT_KEYS.MONITORING, "marketing.record_content"],
    [AGENT_KEYS.CAREER, "marketing.record_content"],
    [AGENT_KEYS.MARKETING, "project.write_file"],
    [AGENT_KEYS.MARKETING, "git.commit_local"],
    [AGENT_KEYS.MARKETING, "git.push_feature_branch"],
    [AGENT_KEYS.MARKETING, "browser.submit_form"],
    [AGENT_KEYS.MARKETING, "memory.write"],
    [AGENT_KEYS.MARKETING, "monitoring.record_check"],
    [AGENT_KEYS.MARKETING, "career.update_status"],
  ])("granting %s the %s capability is refused", (agentKey, capabilityKey) => {
    expect(() => assertGrantAllowed(agentKey, capabilityKey)).toThrow();
  });

  test("Monitoring holds no project, git, browser, or memory-write capability at the role-definition level", () => {
    const monitoring = getAgentDefinition(AGENT_KEYS.MONITORING);
    for (const capability of monitoring.allowedCapabilities) {
      expect(capability.match(/^(project\.|git\.|browser\.)/)).toBeNull();
      expect(capability).not.toBe("memory.write");
    }
  });

  test("Career holds no project, git, browser, or memory-write capability at the role-definition level", () => {
    const career = getAgentDefinition(AGENT_KEYS.CAREER);
    for (const capability of career.allowedCapabilities) {
      expect(capability.match(/^(project\.|git\.|browser\.|monitoring\.)/)).toBeNull();
      expect(capability).not.toBe("memory.write");
    }
  });

  test("Marketing holds no project, git, browser, or memory-write capability at the role-definition level", () => {
    const marketing = getAgentDefinition(AGENT_KEYS.MARKETING);
    for (const capability of marketing.allowedCapabilities) {
      expect(
        capability.match(/^(project\.|git\.|browser\.|monitoring\.|career\.)/)
      ).toBeNull();
      expect(capability).not.toBe("memory.write");
    }
  });

  test("a Reviewer toolset exposes no mutation tool, and invoking one is denied", async () => {
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.REVIEWER });
    for (const capability of MUTATION_CAPABILITIES) {
      expect(toolset.tools[capability]).toBeUndefined();
    }
    await expect(
      invokeCapability({
        toolset,
        capabilityKey: "project.write_file",
        args: {},
        runtimeContext: { requestId: randomUUID() },
      })
    ).rejects.toMatchObject({ code: "POLICY_DENIED" });
  });

  test("a Chief of Staff toolset is empty and cannot invoke Engineering capabilities", async () => {
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.CHIEF_OF_STAFF });
    expect(Object.keys(toolset.tools)).toEqual([]);
    await expect(
      invokeCapability({
        toolset,
        capabilityKey: "git.commit_local",
        args: {},
        runtimeContext: { requestId: randomUUID() },
      })
    ).rejects.toMatchObject({ code: "POLICY_DENIED" });
  });
});

describe("Gate E — model output can never carry authority", () => {
  test.each([
    ["riskLevel", { understanding: "x", riskLevel: "L0" }],
    ["approved", { understanding: "x", approved: true }],
    ["taskStatus", { understanding: "x", taskStatus: "COMPLETED" }],
    ["verificationStatus", { understanding: "x", verificationStatus: "VERIFIED" }],
    ["reviewVerdict", { understanding: "x", reviewVerdict: "PASS" }],
    ["agentId", { understanding: "x", agentId: 1 }],
    ["approvalStatus", { understanding: "x", approvalStatus: "APPROVED" }],
  ])("rejects agent output carrying the %s authority field", (_label, payload) => {
    expect(() => contracts.EngineeringAnalysis(payload)).toThrow();
  });

  test("rejects an authority field nested deep inside otherwise-valid output", () => {
    expect(() =>
      contracts.EngineeringPlan({
        summary: "plan",
        steps: [
          {
            capability: "project.write_file",
            arguments: { nested: { deeper: { riskLevel: "L0" } } },
            rationale: "sneaky",
          },
        ],
      })
    ).toThrow();
  });

  test("accepts legitimate structured output unchanged", () => {
    const analysis = contracts.EngineeringAnalysis({
      understanding: "The add function subtracts.",
      affectedPaths: ["src/calculator.js"],
      risks: [],
    });
    expect(analysis.kind).toBe("EngineeringAnalysis");
    expect(analysis.affectedPaths).toEqual(["src/calculator.js"]);
  });

  test("a review verdict outside the closed enum is rejected", () => {
    expect(() =>
      contracts.ReviewVerdict({ verdict: "DEFINITELY_FINE", summary: "trust me" })
    ).toThrow();
    expect(() =>
      contracts.ReviewVerdict({ verdict: "PASS", summary: "ok" })
    ).not.toThrow();
  });

  test("non-JSON model output cannot drive a state transition", () => {
    expect(() => contracts.ReviewVerdict("PASS — looks good to me!")).toThrow();
  });

  test("a CompletionAssessment claiming completion is only an opinion", () => {
    const assessment = contracts.CompletionAssessment({
      claimedComplete: true,
      rationale: "I finished it.",
    });
    // The contract records the claim but exposes no field any gate consults.
    expect(assessment.claimedComplete).toBe(true);
    expect(assessment).not.toHaveProperty("taskStatus");
  });

  test("self-certification and forced completion are hard-forbidden capabilities", () => {
    expect(HARD_FORBIDDEN).toContain("review.self_certify");
    expect(HARD_FORBIDDEN).toContain("task.force_complete");
    expect(HARD_FORBIDDEN).toContain("agent.impersonate");
  });
});

describe("Gate E — reviewer independence is structural", () => {
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

  async function makeRun(agentId, runKind, attempt = 1) {
    const task = await fixture.createTask({});
    const run = await new AgentRunCoordinator(db).createRun({
      taskId: task.id,
      agentId,
      runKind,
      principal: { type: "AGENT", id: randomUUID() },
      requestId: randomUUID(),
      attempt,
    });
    return { task, run };
  }

  test("Engineering cannot record a review verdict from its own run", async () => {
    const { run } = await makeRun(fixture.engineering.id, RUN_KINDS.IMPLEMENTATION);
    await expect(
      new ReviewService(db).submitVerdict({
        reviewRunId: run.id,
        rawVerdict: { verdict: REVIEW_VERDICTS.PASS, summary: "self-approved" },
        requestId: randomUUID(),
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(await db.yusuf_review_verdicts.count()).toBe(0);
  });

  test("Engineering cannot forge a PASS by mislabelling its run as REVIEW kind", async () => {
    // Even with the right runKind, the owning agent is still Engineering.
    const { run } = await makeRun(fixture.engineering.id, RUN_KINDS.REVIEW);
    await expect(
      new ReviewService(db).submitVerdict({
        reviewRunId: run.id,
        rawVerdict: { verdict: REVIEW_VERDICTS.PASS, summary: "forged" },
        requestId: randomUUID(),
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(await db.yusuf_review_verdicts.count()).toBe(0);
  });

  test("a reviewer run records exactly one immutable verdict", async () => {
    const { run } = await makeRun(fixture.reviewer.id, RUN_KINDS.REVIEW);
    const service = new ReviewService(db);
    await service.submitVerdict({
      reviewRunId: run.id,
      rawVerdict: { verdict: REVIEW_VERDICTS.BLOCK, summary: "broken" },
      requestId: randomUUID(),
    });
    await expect(
      service.submitVerdict({
        reviewRunId: run.id,
        rawVerdict: { verdict: REVIEW_VERDICTS.PASS, summary: "changed my mind" },
        requestId: randomUUID(),
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const stored = await db.yusuf_review_verdicts.findMany();
    expect(stored).toHaveLength(1);
    expect(stored[0].verdict).toBe(REVIEW_VERDICTS.BLOCK);
  });

  test("a review run cannot review itself", async () => {
    const { run } = await makeRun(fixture.reviewer.id, RUN_KINDS.REVIEW);
    await expect(
      new ReviewService(db).submitVerdict({
        reviewRunId: run.id,
        targetRunId: run.id,
        rawVerdict: { verdict: REVIEW_VERDICTS.PASS, summary: "circular" },
        requestId: randomUUID(),
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  test("Engineering cannot create a handoff that appears to come from the Reviewer", async () => {
    const task = await fixture.createTask({});
    await expect(
      new HandoffService(db).create({
        taskId: task.id,
        fromAgentId: fixture.reviewer.id,
        toAgentId: fixture.engineering.id,
        reason: "FORGED",
        actingAgentId: fixture.engineering.id,
        requestId: randomUUID(),
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(await db.yusuf_handoffs.count()).toBe(0);
  });

  test("an Agent cannot hand off to itself to skip review", async () => {
    const task = await fixture.createTask({});
    await expect(
      new HandoffService(db).create({
        taskId: task.id,
        fromAgentId: fixture.engineering.id,
        toAgentId: fixture.engineering.id,
        reason: "SELF",
        actingAgentId: fixture.engineering.id,
        requestId: randomUUID(),
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  test("only the receiving Agent may accept a handoff", async () => {
    const task = await fixture.createTask({});
    const handoffs = new HandoffService(db);
    const handoff = await handoffs.create({
      taskId: task.id,
      fromAgentId: fixture.engineering.id,
      toAgentId: fixture.reviewer.id,
      reason: "IMPLEMENTATION_READY_FOR_REVIEW",
      actingAgentId: fixture.engineering.id,
      requestId: randomUUID(),
    });
    await expect(
      handoffs.accept({
        handoffId: handoff.id,
        acceptingAgentId: fixture.engineering.id,
        requestId: randomUUID(),
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  test("handoff creation is idempotent under duplicate delivery", async () => {
    const task = await fixture.createTask({});
    const handoffs = new HandoffService(db);
    const input = {
      taskId: task.id,
      fromAgentId: fixture.engineering.id,
      toAgentId: fixture.reviewer.id,
      reason: "IMPLEMENTATION_READY_FOR_REVIEW",
      actingAgentId: fixture.engineering.id,
      requestId: randomUUID(),
    };
    const first = await handoffs.create(input);
    const second = await handoffs.create(input);
    expect(second.id).toBe(first.id);
    expect(await db.yusuf_handoffs.count()).toBe(1);
  });

  test("an Agent cannot mark a gated task complete directly — only the policy can", async () => {
    const task = await fixture.createTask({});
    const chief = new ChiefOfStaff(db);
    await chief.delegate({
      taskId: task.id,
      toAgentKey: AGENT_KEYS.ENGINEERING,
      requestId: randomUUID(),
    });
    await chief.markTaskRunning({ taskId: task.id });

    // No implementation evidence, no validation, no review yet.
    const result = await chief.evaluateCompletion({
      taskId: task.id,
      requestId: randomUUID(),
    });
    expect(result.applied).toBe(false);
    expect(result.assessment.complete).toBe(false);
    expect(result.assessment.blockers).toEqual(
      expect.arrayContaining([
        "NO_IMPLEMENTATION_EVIDENCE",
        "NO_VALIDATION_EVIDENCE",
        "NO_REVIEW",
      ])
    );
    const stored = await db.yusuf_tasks.findUnique({ where: { id: task.id } });
    expect(stored.status).not.toBe(TASK_STATUSES.COMPLETED);
  });

  test("duplicate run creation for the same logical work returns one run", async () => {
    const task = await fixture.createTask({});
    const coordinator = new AgentRunCoordinator(db);
    const input = {
      taskId: task.id,
      agentId: fixture.engineering.id,
      runKind: RUN_KINDS.IMPLEMENTATION,
      principal: { type: "AGENT", id: fixture.chief.uuid },
      requestId: randomUUID(),
      attempt: 1,
    };
    const first = await coordinator.createRun(input);
    const second = await coordinator.createRun(input);
    expect(second.id).toBe(first.id);
    expect(await db.yusuf_agent_runs.count({ where: { taskId: task.id } })).toBe(1);
  });

  test("maxConcurrentRuns is enforced from durable state, not an in-process lock", async () => {
    const coordinator = new AgentRunCoordinator(db);
    const taskA = await fixture.createTask({ title: "A" });
    const taskB = await fixture.createTask({ title: "B" });
    const runA = await coordinator.createRun({
      taskId: taskA.id,
      agentId: fixture.engineering.id,
      runKind: RUN_KINDS.IMPLEMENTATION,
      principal: { type: "AGENT", id: fixture.chief.uuid },
      requestId: randomUUID(),
    });
    const runB = await coordinator.createRun({
      taskId: taskB.id,
      agentId: fixture.engineering.id,
      runKind: RUN_KINDS.IMPLEMENTATION,
      principal: { type: "AGENT", id: fixture.chief.uuid },
      requestId: randomUUID(),
    });
    await coordinator.startRun({ runId: runA.id, requestId: randomUUID() });
    // Engineering declares maxConcurrentRuns: 1.
    await expect(
      coordinator.startRun({ runId: runB.id, requestId: randomUUID() })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  test("an illegal AgentRun transition is rejected", async () => {
    const { run } = await makeRun(fixture.engineering.id, RUN_KINDS.IMPLEMENTATION);
    const coordinator = new AgentRunCoordinator(db);
    // QUEUED -> COMPLETED is not a declared edge.
    await expect(
      coordinator.transition({
        runId: run.id,
        to: RUN_STATUSES.COMPLETED,
        requestId: randomUUID(),
      })
    ).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
  });

  test("validation evidence cannot be self-asserted as PASSED", async () => {
    // Regression: the completion gate treats VALIDATION evidence as proof, so
    // its status must come from the governed receipt, never from the caller.
    const { task, run } = await makeRun(
      fixture.engineering.id,
      RUN_KINDS.IMPLEMENTATION
    );
    const coordinator = new AgentRunCoordinator(db);
    await expect(
      coordinator.recordEvidence({
        runId: run.id,
        taskId: task.id,
        kind: "VALIDATION",
        status: "PASSED",
        summary: "trust me, the tests passed",
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(await db.yusuf_run_evidence.count()).toBe(0);
  });

  test("evidence cannot be filed against a task the run does not belong to", async () => {
    const first = await makeRun(fixture.engineering.id, RUN_KINDS.IMPLEMENTATION);
    const otherTask = await fixture.createTask({ title: "Other task" });
    const coordinator = new AgentRunCoordinator(db);
    await expect(
      coordinator.recordEvidence({
        runId: first.run.id,
        taskId: otherTask.id,
        kind: "IMPLEMENTATION",
        status: "INFO",
        summary: "evidence injected into another task",
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(await db.yusuf_run_evidence.count()).toBe(0);
  });

  test("an Agent cannot rewrite a script that a registered command executes", async () => {
    // Regression (independent review, High): project.write_file (L2) plus
    // project.run_command (L2) otherwise compose into arbitrary code execution
    // — write the validation script, then run it. Allowlisting the
    // *executable* does nothing about the content of the *script*.
    const {
      buildWriteFileRequest,
    } = require("../../../domain/yusufOS/adapters/project/requestBuilders");
    await expect(
      buildWriteFileRequest(
        {
          repositoryId: fixture.repositoryUuid,
          relativePath: "test/check.js",
          contents: "require('child_process').execSync('whoami');\n",
        },
        db
      )
    ).rejects.toMatchObject({ code: "ACTION_FORBIDDEN" });

    // A normal source file in the same project is still writable.
    await expect(
      buildWriteFileRequest(
        {
          repositoryId: fixture.repositoryUuid,
          relativePath: "src/calculator.js",
          contents: "module.exports = { add: (a, b) => a + b };\n",
        },
        db
      )
    ).resolves.toBeTruthy();
  });

  test("a command whose executed files cannot be enumerated is not registrable", async () => {
    const {
      registerProjectCommand,
    } = require("../../../domain/yusufOS/adapters/project/commandRegistry");
    // `node --test` discovers files at runtime, so none of them could be
    // protected from an Agent write — refuse the registration instead.
    await expect(
      registerProjectCommand(
        {
          projectId: fixture.project.id,
          key: "project.run_lint",
          executable: "node",
          args: ["--test"],
        },
        db
      )
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  test("an Agent cannot target a repository bound to a different project", async () => {
    // Regression (independent review, High): repositoryId is model-chosen, and
    // a binding lookup alone only proves the binding exists — not that it is
    // this task's repository. Policy resolves project overrides from the
    // task's project, so a cross-project write would also evade them.
    const otherFixture = await createAgentFixture({ db });
    try {
      const task = await fixture.createTask({});
      const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.ENGINEERING, db });
      const run = await new AgentRunCoordinator(db).createRun({
        taskId: task.id,
        agentId: fixture.engineering.id,
        runKind: RUN_KINDS.IMPLEMENTATION,
        principal: { type: "AGENT", id: fixture.chief.uuid },
        requestId: randomUUID(),
      });
      await db.yusuf_tasks.updateMany({
        where: { id: task.id },
        data: { assignedAgentId: fixture.engineering.id },
      });
      await expect(
        invokeCapability({
          toolset,
          capabilityKey: "project.read_file",
          // A real, ACTIVE binding — belonging to the *other* project.
          args: {
            repositoryId: otherFixture.repositoryUuid,
            relativePath: "src/calculator.js",
          },
          runtimeContext: {
            requestId: randomUUID(),
            principal: { type: "AGENT", id: fixture.engineering.uuid },
            agentId: fixture.engineering.id,
            taskId: task.id,
            runId: run.id,
          },
        })
      ).rejects.toMatchObject({ code: "ACTION_FORBIDDEN" });
    } finally {
      otherFixture.cleanup();
    }
  });

  test("an Agent cannot operate on a project it was not assigned", async () => {
    const otherFixture = await createAgentFixture({ db });
    try {
      const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.ENGINEERING, db });
      // A repository uuid that exists but belongs to a different project is
      // still only reachable through an explicit binding lookup; a random one
      // is refused outright.
      await expect(
        invokeCapability({
          toolset,
          capabilityKey: "project.read_file",
          args: { repositoryId: randomUUID(), relativePath: "src/calculator.js" },
          runtimeContext: {
            requestId: randomUUID(),
            principal: { type: "AGENT", id: fixture.engineering.uuid },
            agentId: fixture.engineering.id,
            taskId: 1,
            runId: 1,
          },
        })
      ).rejects.toMatchObject({ code: "ACTION_FORBIDDEN" });
    } finally {
      otherFixture.cleanup();
    }
  });
});
