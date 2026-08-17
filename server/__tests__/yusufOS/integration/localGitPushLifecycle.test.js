const { randomUUID } = require("crypto");
const fs = require("fs");
const os = require("os");
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
const { ApprovalService } = require("../../../domain/yusufOS/approvals/ApprovalService");
const {
  ExecutionCoordinator,
} = require("../../../domain/yusufOS/execution/ExecutionCoordinator");
const { SecuritySettings } = require("../../../domain/yusufOS/security/SecuritySettings");
const { LocalGitAdapter } = require("../../../domain/yusufOS/adapters/localGit/LocalGitAdapter");
const { InMemoryTestAdapter } = require("../../../domain/yusufOS/execution/InMemoryTestAdapter");
const {
  buildCreateBranchRequest,
  buildSwitchBranchRequest,
  buildStagePathsRequest,
  buildCommitLocalRequest,
  buildPushFeatureBranchRequest,
} = require("../../../domain/yusufOS/adapters/localGit/requestBuilders");

// Subclasses the real adapter to prove reconciliation against a push whose
// *reported* outcome was uncertain but whose *effect* genuinely happened —
// super.execute() still performs the real push; only the outcome reported
// back to the coordinator is replaced.
class UncertainOnceAdapter extends LocalGitAdapter {
  async execute(prepared, claim) {
    const result = await super.execute(prepared, claim);
    if (prepared.capabilityKey === "git.push_feature_branch") {
      throw Object.assign(
        new Error("Simulated: the push completed but the outcome could not be confirmed."),
        { effectCertain: false }
      );
    }
    return result;
  }
}

describe("LocalGit push_feature_branch — the first real L3 governed side effect", () => {
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
      data: { uuid: randomUUID(), key: `proj-${randomUUID()}`, name: "Gate D Push Project" },
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
        mission: "Prove the LocalGit push vertical slice.",
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
        title: "Gate D push test",
        objective: "Exercise a governed push intent.",
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

  async function createFeatureBranchWithCommit(branch = "feature/gate-d-push") {
    fixture.git(["checkout", "-b", branch]);
    fs.writeFileSync(path.join(fixture.workRepo, "push-me.txt"), "content\n");
    fixture.git(["add", "push-me.txt"]);
    fixture.git(["commit", "-m", "feature commit"]);
    return { branch, sha: fixture.git(["rev-parse", "HEAD"]).trim() };
  }

  async function dispatchPush(adapter, seeded, branch) {
    const boundary = makeBoundary(adapter);
    const tool = boundary.bindTool({
      name: "local-git-push",
      capability: "git.push_feature_branch",
      buildActionRequest: () =>
        buildPushFeatureBranchRequest({ repositoryId: fixture.repository.uuid, branch }, db),
    });
    return boundary.dispatch({
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
  }

  async function approve(intentUuid, principal = { type: "USER", id: "yusuf" }) {
    const intent = await db.yusuf_action_intents.findUnique({ where: { uuid: intentUuid } });
    const approval = await db.yusuf_approval_requests.findUnique({ where: { intentId: intent.id } });
    await new ApprovalService(db).decide(approval.id, {
      decision: "APPROVE",
      expectedPayloadHash: approval.payloadHash,
      expectedIntentVersion: intent.version,
      expectedApprovalVersion: approval.version,
      principal,
    });
    return intent.id;
  }

  test("push waits for durable approval and touches the remote zero times before it", async () => {
    const { branch } = await createFeatureBranchWithCommit();
    const seeded = await seedAgentTaskRun("git.push_feature_branch");
    const adapter = new LocalGitAdapter({ db });
    const dispatched = await dispatchPush(adapter, seeded, branch);
    expect(dispatched.state).toBe("WAITING_APPROVAL");

    const remoteBranches = fixture.gitBare(["branch", "--list"]);
    expect(remoteBranches).not.toContain(branch);
  });

  test("an approved push creates the exact ref and independent ls-remote verification confirms it", async () => {
    const { branch, sha } = await createFeatureBranchWithCommit();
    const seeded = await seedAgentTaskRun("git.push_feature_branch");
    const adapter = new LocalGitAdapter({ db });
    const dispatched = await dispatchPush(adapter, seeded, branch);
    const numericId = await approve(dispatched.intentId);

    const receipt = await new ExecutionCoordinator({ db, adapter }).execute(numericId);
    expect(receipt).toMatchObject({ outcome: "SUCCEEDED", verificationStatus: "VERIFIED" });

    const lsRemote = fixture.git(["ls-remote", "--exit-code", "origin", `refs/heads/${branch}`]);
    expect(lsRemote).toContain(sha);
  });

  test("a local commit after approval (SHA drift) invalidates the approval; nothing is pushed", async () => {
    const { branch } = await createFeatureBranchWithCommit();
    const seeded = await seedAgentTaskRun("git.push_feature_branch");
    const adapter = new LocalGitAdapter({ db });
    const dispatched = await dispatchPush(adapter, seeded, branch);
    const numericId = await approve(dispatched.intentId);

    fs.writeFileSync(path.join(fixture.workRepo, "drift.txt"), "drift\n");
    fixture.git(["add", "drift.txt"]);
    fixture.git(["commit", "-m", "drift after approval"]);

    await expect(new ExecutionCoordinator({ db, adapter }).execute(numericId)).rejects.toMatchObject(
      { code: "APPROVAL_INVALIDATED", details: { reason: "RESOURCE_CHANGED" } }
    );
    const lsRemote = fixture.git(["ls-remote", "origin", `refs/heads/${branch}`]);
    expect(lsRemote.trim()).toBe("");
  });

  test("a remote swapped after approval invalidates it (account identity changed)", async () => {
    const { branch } = await createFeatureBranchWithCommit();
    const seeded = await seedAgentTaskRun("git.push_feature_branch");
    const adapter = new LocalGitAdapter({ db });
    const dispatched = await dispatchPush(adapter, seeded, branch);
    const numericId = await approve(dispatched.intentId);

    const otherBare = fs.mkdtempSync(path.join(os.tmpdir(), "yusuf-os-other-remote-"));
    fixture.git(["init", "--bare", "--initial-branch=main", otherBare]);
    fixture.git(["remote", "set-url", "origin", otherBare]);

    await expect(new ExecutionCoordinator({ db, adapter }).execute(numericId)).rejects.toMatchObject(
      { code: "APPROVAL_INVALIDATED" }
    );
    fs.rmSync(otherBare, { recursive: true, force: true });
  });

  test("a verified push cannot be executed a second time (server-owned idempotency)", async () => {
    const { branch } = await createFeatureBranchWithCommit();
    const seeded = await seedAgentTaskRun("git.push_feature_branch");
    const adapter = new LocalGitAdapter({ db });
    const dispatched = await dispatchPush(adapter, seeded, branch);
    const numericId = await approve(dispatched.intentId);
    const coordinator = new ExecutionCoordinator({ db, adapter });
    await coordinator.execute(numericId);
    await expect(coordinator.execute(numericId)).resolves.toMatchObject({
      verificationStatus: "VERIFIED",
    });
  });

  test("an uncertain push outcome becomes FAILED_UNKNOWN, blocks blind retry, and reconciliation confirms the real effect", async () => {
    const { branch, sha } = await createFeatureBranchWithCommit();
    const seeded = await seedAgentTaskRun("git.push_feature_branch");
    const adapter = new UncertainOnceAdapter({ db });
    const dispatched = await dispatchPush(adapter, seeded, branch);
    const numericId = await approve(dispatched.intentId);

    const coordinator = new ExecutionCoordinator({ db, adapter });
    const receipt = await coordinator.execute(numericId);
    expect(receipt).toMatchObject({ outcome: "UNKNOWN", verificationStatus: "UNKNOWN" });

    await expect(coordinator.execute(numericId)).rejects.toMatchObject({
      code: "EXECUTION_UNKNOWN",
    });

    const reconciled = await coordinator.reconcile(numericId);
    expect(reconciled).toMatchObject({ outcome: "SUCCEEDED", verificationStatus: "VERIFIED" });
    const lsRemote = fixture.git(["ls-remote", "--exit-code", "origin", `refs/heads/${branch}`]);
    expect(lsRemote).toContain(sha);
  });

  test("the kill switch blocks an already-approved push without consuming the approval", async () => {
    const { branch } = await createFeatureBranchWithCommit();
    const seeded = await seedAgentTaskRun("git.push_feature_branch");
    const adapter = new LocalGitAdapter({ db });
    const dispatched = await dispatchPush(adapter, seeded, branch);
    const numericId = await approve(dispatched.intentId);

    await new SecuritySettings(db).setExternalMutationsDisabled(true, {
      principal: { type: "USER", id: "yusuf" },
      requestId: seeded.requestId,
    });
    await expect(new ExecutionCoordinator({ db, adapter }).execute(numericId)).rejects.toMatchObject(
      { code: "MUTATIONS_DISABLED" }
    );
    const approvalRow = await db.yusuf_approval_requests.findUnique({
      where: { intentId: numericId },
    });
    expect(approvalRow.status).toBe("APPROVED");
    const lsRemote = fixture.git(["ls-remote", "origin", `refs/heads/${branch}`]);
    expect(lsRemote.trim()).toBe("");
  });

  test("the request builder refuses to construct a push targeting the protected default branch", async () => {
    await expect(
      buildPushFeatureBranchRequest({ repositoryId: fixture.repository.uuid, branch: "main" }, db)
    ).rejects.toMatchObject({ code: "ACTION_FORBIDDEN" });
  });

  test("the request builder refuses a push whose *destination* remoteBranch is protected, even from an unprotected local branch", async () => {
    // Regression: only the local source branch was checked, not the actual
    // remote ref being written — a caller could push an unprotected local
    // branch straight onto the remote's protected 'main'.
    await createFeatureBranchWithCommit("feature/gate-d-push");
    await expect(
      buildPushFeatureBranchRequest(
        { repositoryId: fixture.repository.uuid, branch: "feature/gate-d-push", remoteBranch: "main" },
        db
      )
    ).rejects.toMatchObject({ code: "ACTION_FORBIDDEN" });
  });

  test("the request builder refuses to switch onto a protected branch", async () => {
    const {
      buildSwitchBranchRequest,
    } = require("../../../domain/yusufOS/adapters/localGit/requestBuilders");
    await expect(
      buildSwitchBranchRequest({ repositoryId: fixture.repository.uuid, toBranch: "main" }, db)
    ).rejects.toMatchObject({ code: "ACTION_FORBIDDEN" });
  });

  test("protected_branch.direct_push is FORBIDDEN by Policy itself — zero execution, no approval, audited", async () => {
    const seeded = await seedAgentTaskRun("protected_branch.direct_push");
    const intent = await new IntentService(db).create(
      {
        principal: { type: "AGENT", id: seeded.agent.uuid },
        agentId: seeded.agent.id,
        taskId: seeded.task.id,
        runId: seeded.run.id,
        capability: "protected_branch.direct_push",
        resource: { type: "GIT_BRANCH_HEAD", id: `${fixture.repository.uuid}:main`, version: "abc" },
        target: { repositoryId: fixture.repository.uuid, branch: "main" },
        payload: {},
      },
      { requestId: seeded.requestId }
    );
    const policy = await new PolicyEngine(db).evaluate(intent.id);
    expect(policy.decision).toMatchObject({ outcome: "FORBIDDEN", riskLevel: "L4" });
    expect(policy.approval).toBeNull();
    expect(await db.yusuf_approval_requests.count()).toBe(0);
    expect(
      await db.yusuf_audit_events.count({ where: { outcome: "FORBIDDEN" } })
    ).toBe(1);

    const adapter = new InMemoryTestAdapter();
    await expect(
      new ExecutionCoordinator({ db, adapter }).execute(intent.id)
    ).rejects.toMatchObject({ code: "ACTION_FORBIDDEN" });
    expect(adapter.executionCount).toBe(0);
  });

  test("the adapter exposes no raw/force/exec capability", () => {
    const descriptor = new LocalGitAdapter({ db }).descriptor();
    for (const capability of descriptor.capabilities) {
      expect(capability).not.toMatch(/raw|exec|force|reset|clean/i);
    }
  });
});
