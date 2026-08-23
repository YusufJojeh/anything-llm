const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const {
  createTestDatabase,
  clearYusufTables,
} = require("../../../__testUtils__/yusufOS/testDatabase");
const {
  createAgentFixture,
  FIXED_CALCULATOR,
} = require("../../../__testUtils__/yusufOS/agentFixture");
const {
  AgentReasoningLoop,
} = require("../../../domain/yusufOS/agents/AgentReasoningLoop");
const {
  ChiefOfStaff,
} = require("../../../domain/yusufOS/orchestration/ChiefOfStaff");
const {
  RoutedModelClient,
} = require("../../../domain/yusufOS/agents/ModelClient");
const {
  OllamaProvider,
} = require("../../../domain/yusufOS/models/OllamaProvider");

function routed(provider, model) {
  return {
    provider,
    model,
    requestedModel: model,
    modelMismatch: false,
    policy: "FALLBACK_CHAIN",
    fallbackOccurred: false,
    latencyMs: 1,
    usage: {
      confidence: "KNOWN",
      promptTokens: 1,
      completionTokens: 1,
      totalTokens: 2,
    },
    cost: { confidence: "UNAVAILABLE", amountMicros: null },
  };
}

class ScriptedRoutedModel {
  constructor(script) {
    this.script = script;
    this.positions = new Map();
    this.calls = [];
  }

  async complete(args) {
    const key = `${args.agentKey}:${args.phase}`;
    const position = this.positions.get(key) || 0;
    const entries = this.script[key] || [];
    if (position >= entries.length)
      throw new Error(`No scripted decision remains for ${key}.`);
    this.positions.set(key, position + 1);
    this.calls.push({ key, prompt: args.context.prompt });
    const entry = entries[position];
    const decision = typeof entry === "function" ? entry(args.context) : entry;
    const route = routed(
      args.agentKey === "reviewer" ? "REVIEW_FIXTURE" : "ENGINEERING_FIXTURE",
      args.agentKey === "reviewer" ? "independent-review-v1" : "builder-v1"
    );
    return {
      content: JSON.stringify(decision),
      routed: route,
      usage: route.usage,
    };
  }
}

describe("Phase V — real Agentic Engineering E2E", () => {
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

  test("model decisions drive Chief → Engineering → governed fix/test/commit → independent Reviewer → completion", async () => {
    const repositoryId = fixture.repositoryUuid;
    const branch = "codex/fix-calculator";
    const task = await fixture.createTask({
      objective: "fix deterministic calculator bug",
    });
    await db.yusuf_tasks.update({
      where: { id: task.id },
      data: { assignedAgentId: fixture.chief.id, status: "RUNNING" },
    });
    const chiefRun = await db.yusuf_agent_runs.create({
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

    const model = new ScriptedRoutedModel({
      "chief_of_staff:reasoning": [
        ({ prompt }) => {
          expect(prompt).toContain("fix deterministic calculator bug");
          return {
            type: "HANDOFF",
            targetAgent: "engineering",
            reason: "Engineering owns the bounded repository fix.",
          };
        },
      ],
      "engineering:reasoning": [
        {
          type: "CALL_CAPABILITY",
          capability: "git.create_branch",
          arguments: { repositoryId, newBranch: branch, fromRef: "HEAD" },
          reason: "Create an isolated feature branch.",
          expectedOutcome: "Feature branch exists.",
        },
        {
          type: "CALL_CAPABILITY",
          capability: "git.switch_branch",
          arguments: { repositoryId, toBranch: branch },
          reason: "Move work off the protected branch.",
          expectedOutcome: "Feature branch is checked out.",
        },
        ({ prompt }) => {
          expect(prompt).toContain(repositoryId);
          expect(prompt).toContain("project.run_tests");
          return {
            type: "CALL_CAPABILITY",
            capability: "project.read_file",
            arguments: { repositoryId, relativePath: "src/calculator.js" },
            reason: "Inspect the failing implementation.",
            expectedOutcome: "Current calculator source.",
          };
        },
        ({ prompt }) => {
          expect(prompt).toContain("return a - b");
          return {
            type: "CALL_CAPABILITY",
            capability: "project.write_file",
            arguments: {
              repositoryId,
              relativePath: "src/calculator.js",
              contents: FIXED_CALCULATOR,
            },
            reason: "Correct addition with the smallest coherent edit.",
            expectedOutcome: "The governed write verifies on disk.",
          };
        },
        {
          type: "CALL_CAPABILITY",
          capability: "project.run_command",
          arguments: { repositoryId, commandKey: "project.run_tests" },
          reason: "Run the server-registered deterministic validation.",
          expectedOutcome: "Calculator checks pass.",
        },
        ({ prompt }) => {
          expect(prompt).toContain("calculator checks passed");
          return {
            type: "CALL_CAPABILITY",
            capability: "git.stage_paths",
            arguments: { repositoryId, paths: ["src/calculator.js"] },
            reason: "Stage only the verified implementation file.",
            expectedOutcome: "Only calculator.js is staged.",
          };
        },
        {
          type: "CALL_CAPABILITY",
          capability: "git.commit_local",
          arguments: {
            repositoryId,
            message: "fix calculator addition",
          },
          reason: "Create the required local commit.",
          expectedOutcome: "A local feature-branch commit exists.",
        },
        ({ prompt }) => {
          expect(prompt).toContain("commitSha");
          return {
            type: "HANDOFF",
            targetAgent: "reviewer",
            reason:
              "Implementation, validation, and local commit are ready for independent review.",
          };
        },
      ],
      "reviewer:reasoning": [
        ({ prompt }) => {
          expect(prompt).toContain("Independent review context");
          expect(prompt).toContain("project.run_command");
          expect(prompt).toContain("PASSED");
          expect(prompt).toContain("VERIFIED");
          return {
            type: "CALL_CAPABILITY",
            capability: "git.read_show",
            arguments: { repositoryId, ref: "HEAD" },
            reason: "Inspect the committed diff independently.",
            expectedOutcome: "The exact commit and patch.",
          };
        },
        ({ prompt }) => {
          expect(prompt).toContain("a + b");
          return {
            type: "CALL_CAPABILITY",
            capability: "project.read_file",
            arguments: { repositoryId, relativePath: "src/calculator.js" },
            reason: "Read the resulting file independently.",
            expectedOutcome: "The fixed implementation on disk.",
          };
        },
        ({ prompt }) => {
          expect(prompt).toContain("return a + b");
          return {
            type: "REVIEW_VERDICT",
            verdict: "PASS",
            summary:
              "The committed minimal fix matches the objective and governed validation passed.",
            findings: [],
          };
        },
      ],
    });
    const loop = new AgentReasoningLoop({ db, modelClient: model });

    const chiefResult = await loop.execute({ runId: chiefRun.id });
    expect(chiefResult.outcome).toBe("WAITING_HANDOFF");
    const engineeringRun = await db.yusuf_agent_runs.findUnique({
      where: { uuid: chiefResult.nextRunId },
    });

    const engineeringResult = await loop.execute({ runId: engineeringRun.id });
    expect(engineeringResult).toMatchObject({
      outcome: "WAITING_HANDOFF",
      toolCalls: 7,
    });
    const reviewerRun = await db.yusuf_agent_runs.findUnique({
      where: { uuid: engineeringResult.nextRunId },
    });

    const reviewerResult = await loop.execute({ runId: reviewerRun.id });
    expect(reviewerResult).toMatchObject({
      outcome: "COMPLETED",
      reviewVerdict: "PASS",
      toolCalls: 2,
    });

    const completion = await new ChiefOfStaff(db).evaluateCompletion({
      taskId: task.id,
      requestId: randomUUID(),
    });
    expect(completion).toMatchObject({ applied: true, status: "COMPLETED" });

    expect(
      fs.readFileSync(
        path.join(fixture.git.workRepo, "src", "calculator.js"),
        "utf8"
      )
    ).toContain("return a + b");
    expect(fixture.git.git(["branch", "--show-current"]).trim()).toBe(branch);
    expect(fixture.git.git(["log", "-1", "--format=%s"]).trim()).toBe(
      "fix calculator addition"
    );
    expect(
      await db.yusuf_run_evidence.count({ where: { taskId: task.id } })
    ).toBe(2);
    expect(await db.yusuf_review_verdicts.findFirst()).toMatchObject({
      verdict: "PASS",
      targetRunId: engineeringRun.id,
    });
    expect(await db.yusuf_approval_requests.count()).toBe(0);
    expect(model.calls.map((call) => call.key)).toEqual([
      "chief_of_staff:reasoning",
      ...Array(8).fill("engineering:reasoning"),
      ...Array(3).fill("reviewer:reasoning"),
    ]);
  });

  test("optional live Ollama smoke drives a real Chief reasoning handoff when a compatible local model exists", async () => {
    const ollama = new OllamaProvider({ timeoutMs: 3000 });
    const health = await ollama.health();
    if (!health.available || health.models.length === 0) {
      console.log(
        `[phase-v-ollama-live] skipped: no Ollama model reachable at ${ollama.baseUrl}`
      );
      return;
    }
    const modelId = health.models[0].fullName;
    const priorProvider = process.env.YUSUF_OS_CHIEF_OF_STAFF_MODEL_PROVIDER;
    const priorModel = process.env.YUSUF_OS_CHIEF_OF_STAFF_MODEL_ID;
    process.env.YUSUF_OS_CHIEF_OF_STAFF_MODEL_PROVIDER = "OLLAMA";
    process.env.YUSUF_OS_CHIEF_OF_STAFF_MODEL_ID = modelId;
    try {
      const task = await fixture.createTask({
        objective:
          "Delegate the deterministic calculator repair to the Engineering Agent.",
      });
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
      let result;
      try {
        result = await new AgentReasoningLoop({
          db,
          modelClient: new RoutedModelClient(),
        }).execute({
          runId: run.id,
          limits: { maxReasoningSteps: 2, maxToolCalls: 0, maxRetryCount: 0 },
        });
      } catch (error) {
        if (error?.code === "MODEL_UNAVAILABLE") {
          console.log(`[phase-v-ollama-live] skipped: ${error.message}`);
          return;
        }
        throw error;
      }
      expect(result).toMatchObject({ outcome: "WAITING_HANDOFF" });
      expect(
        await db.yusuf_agent_runs.findUnique({
          where: { uuid: result.nextRunId },
        })
      ).toMatchObject({ agentId: fixture.engineering.id, status: "QUEUED" });
    } finally {
      if (priorProvider === undefined)
        delete process.env.YUSUF_OS_CHIEF_OF_STAFF_MODEL_PROVIDER;
      else process.env.YUSUF_OS_CHIEF_OF_STAFF_MODEL_PROVIDER = priorProvider;
      if (priorModel === undefined)
        delete process.env.YUSUF_OS_CHIEF_OF_STAFF_MODEL_ID;
      else process.env.YUSUF_OS_CHIEF_OF_STAFF_MODEL_ID = priorModel;
    }
  }, 120000);
});
