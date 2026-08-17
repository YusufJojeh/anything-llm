const { runGit } = require("./gitProcess");
const { canonicalRemoteFingerprint } = require("./remoteIdentity");

const UNBORN = "UNBORN";

/**
 * The local HEAD SHA of a branch, or the sentinel "UNBORN" if the branch has
 * no commits yet. Used uniformly as `resource.version` — any drift between
 * intent creation and execution (someone committed locally in the meantime)
 * is what actually invalidates a pending approval.
 */
async function branchHeadSha(repositoryRoot, branch) {
  const result = await runGit({
    args: ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`],
    cwd: repositoryRoot,
  });
  if (result.exitCode !== 0) return UNBORN;
  return result.stdout.trim();
}

async function currentBranchName(repositoryRoot) {
  const result = await runGit({
    args: ["symbolic-ref", "--short", "-q", "HEAD"],
    cwd: repositoryRoot,
  });
  return result.exitCode === 0 ? result.stdout.trim() : null;
}

/**
 * Live remote identity. Returns null (not a thrown error) when the remote is
 * not configured, so a caller that doesn't need one (any non-push
 * capability) is unaffected. `assertNoEmbeddedCredentials` still runs, so a
 * misconfigured remote with an embedded password is rejected regardless of
 * which capability triggered the read.
 */
async function remoteFingerprint(repositoryRoot, remoteName) {
  if (!remoteName) return null;
  const result = await runGit({
    args: ["remote", "get-url", remoteName],
    cwd: repositoryRoot,
  });
  if (result.exitCode !== 0) return null;
  return canonicalRemoteFingerprint(result.stdout.trim());
}

async function remoteBranchSha(repositoryRoot, remoteUrl, remoteBranch) {
  const result = await runGit({
    args: ["ls-remote", "--exit-code", remoteUrl, `refs/heads/${remoteBranch}`],
    cwd: repositoryRoot,
  });
  if (result.exitCode === 2) return UNBORN; // ls-remote's code for "ref not found"
  if (result.exitCode !== 0) return null; // remote unreachable/unknown — distinct from "absent"
  const [sha] = result.stdout.trim().split(/\s+/);
  return sha || UNBORN;
}

module.exports = {
  UNBORN,
  branchHeadSha,
  currentBranchName,
  remoteFingerprint,
  remoteBranchSha,
};
