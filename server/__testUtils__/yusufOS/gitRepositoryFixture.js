const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { YusufGitRepository } = require("../../models/yusufOS/gitRepository");
const {
  canonicalRemoteFingerprint,
} = require("../../domain/yusufOS/adapters/localGit/remoteIdentity");

// Isolated from Yusuf's real ~/.gitconfig for the same reason gitProcess.js
// isolates governed invocations — fixture setup uses plain git plumbing, not
// the adapter, so it needs its own isolation.
function fixtureEnv(home) {
  return {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: "1",
    HOME: home,
    USERPROFILE: home,
    GIT_TERMINAL_PROMPT: "0",
  };
}

function git(args, cwd, home) {
  return execFileSync("git", args, {
    cwd,
    env: fixtureEnv(home),
    encoding: "utf8",
    windowsHide: true,
  });
}

/**
 * Builds a disposable working repo + local bare remote entirely under the
 * OS temp directory. No network, no GitHub, no `gh` auth — the only
 * automated push target Gate D tests are allowed to use.
 */
async function createGitFixture({
  db,
  projectId,
  key = "gate-d-fixture",
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "yusuf-os-gate-d-"));
  const home = path.join(root, "home");
  const workRepo = path.join(root, "work-repo");
  const bareRemote = path.join(root, "remote.git");
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(workRepo, { recursive: true });

  git(["init", "--initial-branch=main", "."], workRepo, home);
  git(["config", "user.name", "Gate D Fixture"], workRepo, home);
  git(
    ["config", "user.email", "gate-d-fixture@example.invalid"],
    workRepo,
    home
  );
  fs.writeFileSync(path.join(workRepo, "README.md"), "gate d fixture\n");
  git(["add", "README.md"], workRepo, home);
  git(["commit", "-m", "initial commit"], workRepo, home);

  git(["init", "--bare", "--initial-branch=main", bareRemote], root, home);
  git(["remote", "add", "origin", bareRemote], workRepo, home);

  const canonicalRoot = fs.realpathSync.native(workRepo);
  const allowedRemoteIdentity = canonicalRemoteFingerprint(bareRemote);

  const repository = await YusufGitRepository.create(
    {
      projectId,
      key,
      canonicalRoot,
      defaultBranch: "main",
      protectedBranches: ["main", "master"],
      allowedRemoteName: "origin",
      allowedRemoteIdentity,
      allowLocalCommit: true,
      allowFeaturePush: true,
    },
    db
  );

  return {
    root,
    home,
    workRepo: canonicalRoot,
    bareRemote,
    repository,
    git: (args) => git(args, canonicalRoot, home),
    gitBare: (args) => git(args, bareRemote, home),
    installMaliciousHook(hookName, script) {
      const hooksDir = path.join(canonicalRoot, ".git", "hooks");
      const hookPath = path.join(hooksDir, hookName);
      fs.writeFileSync(hookPath, script, { mode: 0o755 });
      return hookPath;
    },
    cleanup() {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

module.exports = { createGitFixture };
