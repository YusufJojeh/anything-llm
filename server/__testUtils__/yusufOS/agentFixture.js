const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const { createGitFixture } = require("./gitRepositoryFixture");
const {
  ensureCoreStaff,
} = require("../../domain/yusufOS/agents/AgentRegistry");
const {
  registerProjectCommand,
} = require("../../domain/yusufOS/adapters/project/commandRegistry");
const { AGENT_KEYS } = require("../../domain/yusufOS/constants");

// A deliberately wrong implementation: add() subtracts. The registered
// validation command fails against it, which is what makes the end-to-end
// scenario a real "make the failing test pass" task rather than a no-op.
const BROKEN_CALCULATOR = `module.exports = {
  add(a, b) {
    return a - b;
  },
};
`;

const FIXED_CALCULATOR = `module.exports = {
  add(a, b) {
    return a + b;
  },
};
`;

// Runs under plain `node` with no test framework, so validation needs no
// package install and no network — exit code alone is the evidence.
const CHECK_SCRIPT = `const assert = require("assert");
const calculator = require("../src/calculator.js");
assert.strictEqual(calculator.add(2, 3), 5, "add(2,3) must equal 5");
console.log("calculator checks passed");
`;

/**
 * Full Gate E fixture: a disposable git-backed project, the three core Agents
 * seeded with their code-owned capability grants, and a registered validation
 * command. No network, no LLM key, no GitHub.
 */
async function createAgentFixture({ db, projectKey = null } = {}) {
  const project = await db.yusuf_projects.create({
    data: {
      uuid: randomUUID(),
      key: projectKey || `proj-${randomUUID()}`,
      name: "Gate E Engineering Project",
    },
  });

  const git = await createGitFixture({ db, projectId: project.id });

  fs.mkdirSync(path.join(git.workRepo, "src"), { recursive: true });
  fs.mkdirSync(path.join(git.workRepo, "test"), { recursive: true });
  fs.writeFileSync(
    path.join(git.workRepo, "src", "calculator.js"),
    BROKEN_CALCULATOR
  );
  fs.writeFileSync(path.join(git.workRepo, "test", "check.js"), CHECK_SCRIPT);
  git.git(["add", "."]);
  git.git(["commit", "-m", "add calculator with failing check"]);

  await registerProjectCommand(
    {
      projectId: project.id,
      key: "project.run_tests",
      description: "Deterministic calculator checks.",
      executable: "node",
      args: ["test/check.js"],
      cwdRelative: ".",
      timeoutMs: 30000,
    },
    db
  );

  const agents = await ensureCoreStaff(db);

  return {
    project,
    git,
    agents,
    chief: agents[AGENT_KEYS.CHIEF_OF_STAFF],
    engineering: agents[AGENT_KEYS.ENGINEERING],
    reviewer: agents[AGENT_KEYS.REVIEWER],
    monitoring: agents[AGENT_KEYS.MONITORING],
    career: agents[AGENT_KEYS.CAREER],
    marketing: agents[AGENT_KEYS.MARKETING],
    founder: agents[AGENT_KEYS.FOUNDER],
    research: agents[AGENT_KEYS.RESEARCH],
    repositoryUuid: git.repository.uuid,
    BROKEN_CALCULATOR,
    FIXED_CALCULATOR,
    async createTask({ title, objective, requestId, principal } = {}) {
      return db.yusuf_tasks.create({
        data: {
          uuid: randomUUID(),
          projectId: project.id,
          requestedByPrincipalType: principal?.type || "USER",
          requestedByPrincipalId: principal?.id || "yusuf",
          title: title || "Fix the calculator",
          objective:
            objective ||
            "Modify src/calculator.js so the registered validation command passes.",
          taskKind: "ENGINEERING",
          status: "PLANNED",
          requestId: requestId || randomUUID(),
        },
      });
    },
    cleanup() {
      git.cleanup();
    },
  };
}

module.exports = {
  createAgentFixture,
  BROKEN_CALCULATOR,
  FIXED_CALCULATOR,
  CHECK_SCRIPT,
};
