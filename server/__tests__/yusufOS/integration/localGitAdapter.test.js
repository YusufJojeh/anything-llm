const { randomUUID } = require("crypto");
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
  buildCreateBranchRequest,
  buildSwitchBranchRequest,
  buildStagePathsRequest,
  buildCommitLocalRequest,
} = require("../../../domain/yusufOS/adapters/localGit/requestBuilders");

describe("LocalGit adapter — read and local-write capabilities via the full Action Boundary", () => {
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
      data: { uuid: randomUUID(), key: `proj-${randomUUID()}`, name: "Gate D Project" },
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
        name: "Gate D Engineering Agent",
        mission: "Prove the LocalGit vertical slice.",
        instructions: "Use only governed Git capabilities.",
        status: "ACTIVE",
      },
    });
    const task = await db.yusuf_tasks.create({
      data: {
        uuid: randomUUID(),
        assignedAgentId: agent.id,
        requestedByPrincipalType: "AGENT",
        requestedByPrincipalId: agent.uuid,
        title: "Gate D LocalGit test",
        objective: "Exercise a governed Git intent.",
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

  function makeBoundary(adapter) {
    return new YusufActionBoundary({
      intentService: new IntentService(db),
      policyEngine: new PolicyEngine(db),
      executionCoordinatorFactory: () => new ExecutionCoordinator({ db, adapter }),
    });
  }

  async function dispatchGoverned(capabilityKey, buildActionRequest, args) {
    const seeded = await seedAgentTaskRun(capabilityKey);
    const adapter = new LocalGitAdapter({ db });
    const boundary = makeBoundary(adapter);
    const tool = boundary.bindTool({
      name: `local-git-${capabilityKey}`,
      capability: capabilityKey,
      buildActionRequest: () => buildActionRequest(args, db),
    });
    const result = await boundary.dispatch({
      functionConfig: tool,
      arguments: args,
      runtimeContext: {
        requestId: seeded.requestId,
        principal: { type: "AGENT", id: seeded.agent.uuid },
        agentId: seeded.agent.id,
        taskId: seeded.task.id,
        runId: seeded.run.id,
      },
    });
    return { result, seeded };
  }

  test("git.read_status executes through the boundary and is verified", async () => {
    const { result } = await dispatchGoverned(
      "git.read_status",
      (args, db) => buildReadRequest("git.read_status", { repositoryId: fixture.repository.uuid, branch: "main" }, db),
      {}
    );
    expect(result).toMatchObject({ outcome: "SUCCEEDED", verificationStatus: "VERIFIED" });
    expect(result.sanitizedResult).toContain("branch.head main");
  });

  test("git.read_diff, git.read_log, and git.read_show all execute and verify", async () => {
    const diff = await dispatchGoverned(
      "git.read_diff",
      (args, db) => buildReadRequest("git.read_diff", { repositoryId: fixture.repository.uuid, branch: "main" }, db),
      {}
    );
    expect(diff.result).toMatchObject({ outcome: "SUCCEEDED", verificationStatus: "VERIFIED" });

    const log = await dispatchGoverned(
      "git.read_log",
      (args, db) => buildReadRequest("git.read_log", { repositoryId: fixture.repository.uuid, branch: "main" }, db),
      {}
    );
    expect(log.result.sanitizedResult).toContain("initial commit");

    const headSha = fixture.git(["rev-parse", "HEAD"]).trim();
    const show = await dispatchGoverned(
      "git.read_show",
      (args, db) =>
        buildReadRequest(
          "git.read_show",
          { repositoryId: fixture.repository.uuid, branch: "main", ref: headSha },
          db
        ),
      {}
    );
    expect(show.result.sanitizedResult).toContain(headSha);
  });

  test("git.create_branch, git.switch_branch, git.stage_paths, git.commit_local form a working local chain", async () => {
    const created = await dispatchGoverned(
      "git.create_branch",
      (args, db) =>
        buildCreateBranchRequest(
          { repositoryId: fixture.repository.uuid, newBranch: "feature/gate-d" },
          db
        ),
      {}
    );
    expect(created.result).toMatchObject({ outcome: "SUCCEEDED", verificationStatus: "VERIFIED" });

    const switched = await dispatchGoverned(
      "git.switch_branch",
      (args, db) =>
        buildSwitchBranchRequest(
          { repositoryId: fixture.repository.uuid, toBranch: "feature/gate-d" },
          db
        ),
      {}
    );
    expect(switched.result).toMatchObject({ outcome: "SUCCEEDED", verificationStatus: "VERIFIED" });
    expect(fixture.git(["symbolic-ref", "--short", "HEAD"]).trim()).toBe("feature/gate-d");

    require("fs").writeFileSync(
      require("path").join(fixture.workRepo, "gate-d.txt"),
      "gate d change\n"
    );
    const staged = await dispatchGoverned(
      "git.stage_paths",
      (args, db) =>
        buildStagePathsRequest(
          { repositoryId: fixture.repository.uuid, paths: ["gate-d.txt"] },
          db
        ),
      {}
    );
    expect(staged.result).toMatchObject({ outcome: "SUCCEEDED", verificationStatus: "VERIFIED" });

    const committed = await dispatchGoverned(
      "git.commit_local",
      (args, db) =>
        buildCommitLocalRequest(
          { repositoryId: fixture.repository.uuid, message: "gate d local commit" },
          db
        ),
      {}
    );
    expect(committed.result).toMatchObject({ outcome: "SUCCEEDED", verificationStatus: "VERIFIED" });
    const newHead = fixture.git(["rev-parse", "HEAD"]).trim();
    expect(JSON.parse(committed.result.sanitizedResult).commitSha).toBe(newHead);
  });

  test("committing directly on the protected default branch is refused before an intent is even created", async () => {
    await expect(
      dispatchGoverned(
        "git.commit_local",
        (args, db) =>
          buildCommitLocalRequest(
            { repositoryId: fixture.repository.uuid, message: "should never land" },
            db
          ),
        {}
      )
    ).rejects.toMatchObject({ code: "ACTION_FORBIDDEN" });
  });

  test("a malicious pre-commit hook does not execute during a governed commit", async () => {
    const markerFile = require("path").join(fixture.root, "PWNED");
    fixture.installMaliciousHook(
      "pre-commit",
      `#!/bin/sh\necho pwned > "${markerFile.replace(/\\/g, "/")}"\nexit 1\n`
    );
    await dispatchGoverned(
      "git.create_branch",
      (args, db) =>
        buildCreateBranchRequest({ repositoryId: fixture.repository.uuid, newBranch: "feature/hook-test" }, db),
      {}
    );
    await dispatchGoverned(
      "git.switch_branch",
      (args, db) =>
        buildSwitchBranchRequest({ repositoryId: fixture.repository.uuid, toBranch: "feature/hook-test" }, db),
      {}
    );
    require("fs").writeFileSync(require("path").join(fixture.workRepo, "hook-test.txt"), "x\n");
    await dispatchGoverned(
      "git.stage_paths",
      (args, db) =>
        buildStagePathsRequest({ repositoryId: fixture.repository.uuid, paths: ["hook-test.txt"] }, db),
      {}
    );
    const committed = await dispatchGoverned(
      "git.commit_local",
      (args, db) =>
        buildCommitLocalRequest({ repositoryId: fixture.repository.uuid, message: "hook adversarial test" }, db),
      {}
    );
    expect(committed.result.outcome).toBe("SUCCEEDED");
    expect(require("fs").existsSync(markerFile)).toBe(false);
  });

  test("a repository binding that disallows local writes refuses even a read-adjacent local write", async () => {
    await db.yusuf_git_repositories.update({
      where: { id: fixture.repository.id },
      data: { allowLocalCommit: false },
    });
    await expect(
      dispatchGoverned(
        "git.create_branch",
        (args, db) =>
          buildCreateBranchRequest({ repositoryId: fixture.repository.uuid, newBranch: "feature/should-fail" }, db),
        {}
      )
    ).rejects.toMatchObject({ code: "ACTION_FORBIDDEN" });
  });

  test("an unbound repository id is refused even though the directory exists on disk", async () => {
    await expect(
      dispatchGoverned(
        "git.read_status",
        (args, db) => buildReadRequest("git.read_status", { repositoryId: randomUUID(), branch: "main" }, db),
        {}
      )
    ).rejects.toMatchObject({ code: "ACTION_FORBIDDEN" });
  });
});
