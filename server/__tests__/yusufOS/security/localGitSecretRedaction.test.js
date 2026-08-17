const { randomUUID } = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  createTestDatabase,
  clearYusufTables,
} = require("../../../__testUtils__/yusufOS/testDatabase");
const { createGitFixture } = require("../../../__testUtils__/yusufOS/gitRepositoryFixture");
const {
  YusufActionBoundary,
} = require("../../../domain/yusufOS/runtime/YusufActionBoundary");
const { IntentService } = require("../../../domain/yusufOS/actions/IntentService");
const { PolicyEngine } = require("../../../domain/yusufOS/policy/PolicyEngine");
const {
  ExecutionCoordinator,
} = require("../../../domain/yusufOS/execution/ExecutionCoordinator");
const { LocalGitAdapter } = require("../../../domain/yusufOS/adapters/localGit/LocalGitAdapter");
const {
  buildReadRequest,
  buildPushFeatureBranchRequest,
} = require("../../../domain/yusufOS/adapters/localGit/requestBuilders");

describe("LocalGit adapter — secret handling", () => {
  let testDatabase;
  let db;
  let fixture;
  let project;

  beforeAll(async () => {
    testDatabase = await createTestDatabase();
    db = testDatabase.db;
  }, 120000);

  afterAll(async () => {
    if (testDatabase) await testDatabase.cleanup();
  });

  beforeEach(async () => {
    await clearYusufTables(db);
    project = await db.yusuf_projects.create({
      data: { uuid: randomUUID(), key: `proj-${randomUUID()}`, name: "Gate D Secrets Project" },
    });
    fixture = await createGitFixture({ db, projectId: project.id });
  });

  afterEach(() => {
    if (fixture) fixture.cleanup();
  });

  async function seedAgentTaskRun(capabilityKey) {
    const requestId = randomUUID();
    const agent = await db.yusuf_agents.create({
      data: {
        uuid: randomUUID(),
        key: `agent-${randomUUID()}`,
        name: "Gate D Secrets Agent",
        mission: "Prove secret handling.",
        instructions: "Read committed content only.",
        status: "ACTIVE",
      },
    });
    const task = await db.yusuf_tasks.create({
      data: {
        uuid: randomUUID(),
        assignedAgentId: agent.id,
        requestedByPrincipalType: "AGENT",
        requestedByPrincipalId: agent.uuid,
        title: "Gate D secret redaction test",
        objective: "Exercise redaction on committed secret-shaped content.",
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
      data: { agentId: agent.id, capabilityKey, capabilityVersion: 1 },
    });
    return { agent, task, run, requestId };
  }

  test("a secret-shaped string committed to the repo is redacted in the persisted receipt", async () => {
    fs.writeFileSync(
      path.join(fixture.workRepo, "config.txt"),
      "AKIAABCDEFGHIJKLMNOP some other content\n"
    );
    fixture.git(["add", "config.txt"]);
    fixture.git(["commit", "-m", "add config with an aws-shaped key"]);
    const headSha = fixture.git(["rev-parse", "HEAD"]).trim();

    const seeded = await seedAgentTaskRun("git.read_show");
    const adapter = new LocalGitAdapter({ db });
    const boundary = new YusufActionBoundary({
      intentService: new IntentService(db),
      policyEngine: new PolicyEngine(db),
      executionCoordinatorFactory: () => new ExecutionCoordinator({ db, adapter }),
    });
    const tool = boundary.bindTool({
      name: "local-git-show",
      capability: "git.read_show",
      buildActionRequest: () =>
        buildReadRequest(
          "git.read_show",
          { repositoryId: fixture.repository.uuid, branch: "main", ref: headSha },
          db
        ),
    });
    const receipt = await boundary.dispatch({
      functionConfig: tool,
      arguments: {},
      runtimeContext: {
        requestId: seeded.requestId,
        principal: { type: "AGENT", id: seeded.agent.uuid },
        agentId: seeded.agent.id,
        taskId: seeded.task.id,
        runId: seeded.run.id,
      },
    });
    expect(receipt.sanitizedResult).not.toContain("AKIAABCDEFGHIJKLMNOP");
    expect(receipt.sanitizedResult).toContain("[REDACTED]");
  });

  test("a repository whose remote has embedded credentials refuses to build a push request", async () => {
    await db.yusuf_git_repositories.update({
      where: { id: fixture.repository.id },
      data: { allowedRemoteIdentity: "placeholder" },
    });
    fixture.git(["remote", "set-url", "origin", "https://user:hunter2@example.invalid/repo.git"]);
    await expect(
      buildPushFeatureBranchRequest(
        { repositoryId: fixture.repository.uuid, branch: "feature/whatever" },
        db
      )
    ).rejects.toThrow();
  });

  test("commit message text is passed as inert argv data, never shell-interpreted", async () => {
    fixture.git(["checkout", "-b", "feature/shell-safety"]);
    fs.writeFileSync(path.join(fixture.workRepo, "shell-safety.txt"), "x\n");
    fixture.git(["add", "shell-safety.txt"]);

    const seeded = await seedAgentTaskRun("git.commit_local");
    const adapter = new LocalGitAdapter({ db });
    const boundary = new YusufActionBoundary({
      intentService: new IntentService(db),
      policyEngine: new PolicyEngine(db),
      executionCoordinatorFactory: () => new ExecutionCoordinator({ db, adapter }),
    });
    const dangerousMessage = "hello `touch pwned` $(touch pwned2) ; rm -rf / --no-preserve-root";
    const {
      buildCommitLocalRequest,
    } = require("../../../domain/yusufOS/adapters/localGit/requestBuilders");
    const tool = boundary.bindTool({
      name: "local-git-commit-shell-safety",
      capability: "git.commit_local",
      buildActionRequest: () =>
        buildCommitLocalRequest(
          { repositoryId: fixture.repository.uuid, message: dangerousMessage },
          db
        ),
    });
    const receipt = await boundary.dispatch({
      functionConfig: tool,
      arguments: {},
      runtimeContext: {
        requestId: seeded.requestId,
        principal: { type: "AGENT", id: seeded.agent.uuid },
        agentId: seeded.agent.id,
        taskId: seeded.task.id,
        runId: seeded.run.id,
      },
    });
    expect(receipt.outcome).toBe("SUCCEEDED");
    expect(fs.existsSync(path.join(fixture.root, "pwned"))).toBe(false);
    expect(fs.existsSync(path.join(fixture.workRepo, "pwned2"))).toBe(false);
    const log = fixture.git(["log", "-1", "--format=%s"]);
    expect(log).toContain("touch pwned");
  });
});
