const prisma = require("../../../../utils/prisma");
const { GovernedAdapter } = require("../../execution/AdapterContract");
const { canonicalHash } = require("../../security/canonicalJson");
const {
  resolveBoundRepository,
  assertRepositoryMatchesTask,
} = require("./repositoryIdentity");
const { parseResourceId } = require("./shapes");
const { runGit, assertGitAvailable } = require("./gitProcess");
const {
  branchHeadSha,
  currentBranchName,
  remoteFingerprint,
  remoteBranchSha,
} = require("./snapshot");

const CAPABILITIES = Object.freeze([
  "git.read_status",
  "git.read_diff",
  "git.read_log",
  "git.read_show",
  "git.create_branch",
  "git.switch_branch",
  "git.stage_paths",
  "git.commit_local",
  "git.push_feature_branch",
]);

const MAX_OUTPUT_CHARS = 20000;

function boundedText(text) {
  const value = text || "";
  return value.length > MAX_OUTPUT_CHARS
    ? `${value.slice(0, MAX_OUTPUT_CHARS)}...[truncated]`
    : value;
}

// Marks an error as a *known* pre-effect failure (Git rejected the operation
// cleanly and definitely did not apply it) as opposed to the default
// treatment of an unexpected error, which is always the conservative
// FAILED_UNKNOWN path — see gitProcess.runGit for the timeout/kill case,
// which is tagged effectCertain:false at the source instead.
function certainFailure(message) {
  return Object.assign(new Error(message), { effectCertain: true });
}

function assertGitSucceeded(result, label) {
  if (result.exitCode !== 0)
    throw certainFailure(`git ${label} failed: ${boundedText(result.stderr)}`);
  return result;
}

async function assertBranchStillCheckedOut(cwd, expectedBranch) {
  const current = await currentBranchName(cwd);
  if (current !== expectedBranch)
    throw certainFailure(
      `Expected branch '${expectedBranch}' to be checked out, found '${current || "<detached HEAD>"}'.`
    );
}

/**
 * The first real governed execution adapter. Every operation is scoped to a
 * `yusuf_git_repositories` binding re-verified against live disk state on
 * every call — nothing here trusts a path or branch name supplied at
 * request-build time without re-checking it against the repository root at
 * execution time too.
 */
class LocalGitAdapter extends GovernedAdapter {
  constructor({ db = prisma } = {}) {
    super();
    this.db = db;
  }

  descriptor() {
    return { id: "local-git", kind: "LOCAL_GIT", capabilities: CAPABILITIES };
  }

  async availability() {
    const ok = await assertGitAvailable();
    return { status: ok ? "AVAILABLE" : "UNAVAILABLE", account: null };
  }

  async preflight(intentSnapshot) {
    const { repositoryId, branch } = parseResourceId(intentSnapshot.resourceId);
    const repository = await resolveBoundRepository(repositoryId, this.db);
    await assertRepositoryMatchesTask(repository, intentSnapshot, this.db);
    const target = JSON.parse(intentSnapshot.canonicalTarget || "{}");
    const resourceVersion = await branchHeadSha(
      repository.canonicalRoot,
      branch
    );
    // Recomputed with the *originally recorded* resource version, not the
    // live one, so this digest only moves when repo/branch/remote identity
    // itself changes — SHA drift is reported through resourceVersion alone.
    // See ARCHITECTURE_INVARIANTS.md / KNOWN_RISKS.md for why these are kept
    // as two independent, non-overlapping signals.
    const targetIdentityDigest = canonicalHash({
      resource: {
        type: intentSnapshot.resourceType,
        id: intentSnapshot.resourceId,
        version: intentSnapshot.resourceVersion,
      },
      target,
    });
    const accountIdentity = target.remoteName
      ? await remoteFingerprint(repository.canonicalRoot, target.remoteName)
      : null;
    return { accountIdentity, resourceVersion, targetIdentityDigest };
  }

  async prepare(intent) {
    const { repositoryId, branch } = parseResourceId(intent.resourceId);
    const repository = await resolveBoundRepository(repositoryId, this.db);
    await assertRepositoryMatchesTask(repository, intent, this.db);
    return {
      capabilityKey: intent.capabilityKey,
      repository,
      branch,
      target: JSON.parse(intent.canonicalTarget || "{}"),
      payload: JSON.parse(intent.canonicalPayload || "{}"),
      expectedLocalSha: intent.resourceVersion,
    };
  }

  async execute(prepared) {
    const {
      capabilityKey,
      repository,
      branch,
      target,
      payload,
      expectedLocalSha,
    } = prepared;
    const cwd = repository.canonicalRoot;
    try {
      switch (capabilityKey) {
        case "git.read_status": {
          const result = assertGitSucceeded(
            await runGit({
              args: ["status", "--porcelain=v2", "--branch"],
              cwd,
            }),
            "status"
          );
          return {
            outcome: "SUCCEEDED",
            result: { status: boundedText(result.stdout) },
          };
        }
        case "git.read_diff": {
          // No `--` before the ref: it is a revision, not a pathspec, and
          // assertValidRevision already guarantees it cannot start with '-'
          // (which is the only thing `--` would protect against here).
          const result = assertGitSucceeded(
            await runGit({
              args: ["diff", "--no-ext-diff", "--no-textconv", payload.ref],
              cwd,
            }),
            "diff"
          );
          return {
            outcome: "SUCCEEDED",
            result: { diff: boundedText(result.stdout) },
          };
        }
        case "git.read_log": {
          const result = assertGitSucceeded(
            await runGit({
              args: [
                "log",
                "--no-ext-diff",
                "-n",
                String(payload.maxCount),
                "--format=%H%x1f%an%x1f%aI%x1f%s",
                payload.ref,
              ],
              cwd,
            }),
            "log"
          );
          return {
            outcome: "SUCCEEDED",
            result: { log: boundedText(result.stdout) },
          };
        }
        case "git.read_show": {
          const result = assertGitSucceeded(
            await runGit({
              args: ["show", "--no-ext-diff", "--no-textconv", payload.ref],
              cwd,
            }),
            "show"
          );
          return {
            outcome: "SUCCEEDED",
            result: { show: boundedText(result.stdout) },
          };
        }
        case "git.create_branch": {
          assertGitSucceeded(
            await runGit({
              args: ["branch", "--no-track", "--", branch, payload.fromRef],
              cwd,
            }),
            "create branch"
          );
          return { outcome: "SUCCEEDED", result: { created: branch } };
        }
        case "git.switch_branch": {
          assertGitSucceeded(
            await runGit({ args: ["switch", "--no-guess", "--", branch], cwd }),
            "switch branch"
          );
          return { outcome: "SUCCEEDED", result: { switchedTo: branch } };
        }
        case "git.stage_paths": {
          // `git add`/`git commit` always act on whichever branch is
          // *currently* checked out, not on the `branch` this intent was
          // bound to. Without this check, a concurrent switch_branch could
          // make a governed stage/commit land on a different — possibly
          // protected — branch than the one Policy actually authorized.
          await assertBranchStillCheckedOut(cwd, branch);
          assertGitSucceeded(
            await runGit({ args: ["add", "--", ...payload.paths], cwd }),
            "stage paths"
          );
          return { outcome: "SUCCEEDED", result: { staged: payload.paths } };
        }
        case "git.commit_local": {
          await assertBranchStillCheckedOut(cwd, branch);
          const staged = assertGitSucceeded(
            await runGit({ args: ["diff", "--cached", "--name-only"], cwd }),
            "read staged paths"
          );
          if (!staged.stdout.trim())
            throw certainFailure(
              "Nothing is staged; refusing an empty commit."
            );
          assertGitSucceeded(
            await runGit({
              args: ["commit", "--no-verify", "-m", payload.message],
              cwd,
            }),
            "commit"
          );
          const head = assertGitSucceeded(
            await runGit({ args: ["rev-parse", "HEAD"], cwd }),
            "read new HEAD"
          );
          return {
            outcome: "SUCCEEDED",
            result: { commitSha: head.stdout.trim() },
          };
        }
        case "git.push_feature_branch": {
          const refspec = `${expectedLocalSha}:refs/heads/${target.remoteBranch}`;
          const result = await runGit({
            args: ["push", "--no-verify", target.remoteName, refspec],
            cwd,
            timeoutMs: 30000,
          });
          // A clean non-zero exit here means Git itself rejected the push
          // (non-fast-forward, unknown remote, auth failure) before any
          // network effect — a known, pre-effect failure, not an unknown one.
          if (result.exitCode !== 0)
            throw certainFailure(
              `git push rejected: ${boundedText(result.stderr)}`
            );
          return {
            outcome: "SUCCEEDED",
            externalReference: `${target.remoteName}:${target.remoteBranch}@${expectedLocalSha}`,
            result: {
              pushedSha: expectedLocalSha,
              remoteBranch: target.remoteBranch,
            },
          };
        }
        default:
          throw certainFailure(
            `Unsupported LocalGit capability: ${capabilityKey}`
          );
      }
    } catch (error) {
      if (error.effectCertain !== undefined) throw error;
      // Anything not explicitly classified above (e.g. an unexpected
      // filesystem error) is treated as uncertain by default — the safe
      // direction to be wrong in is FAILED_UNKNOWN, never a false SUCCEEDED.
      throw Object.assign(error, { effectCertain: false });
    }
  }

  async verify(intent, executionResult) {
    const { repositoryId, branch } = parseResourceId(intent.resourceId);
    let repository;
    try {
      repository = await resolveBoundRepository(repositoryId, this.db);
    } catch {
      return {
        status: "UNKNOWN",
        result: { reason: "repository binding unavailable" },
        evidence: [],
      };
    }
    const cwd = repository.canonicalRoot;
    const target = JSON.parse(intent.canonicalTarget || "{}");
    switch (intent.capabilityKey) {
      case "git.read_status":
      case "git.read_diff":
      case "git.read_log":
      case "git.read_show":
        // Nothing external changed for a pure read; the receipt itself is
        // the only artifact, so there is nothing further to re-prove.
        return { status: "VERIFIED", result: {}, evidence: [] };
      case "git.create_branch": {
        const sha = await branchHeadSha(cwd, branch);
        return sha === "UNBORN"
          ? { status: "NOT_APPLIED", result: {}, evidence: [] }
          : {
              status: "VERIFIED",
              result: { sha },
              evidence: [{ type: "git-rev-parse", sha }],
            };
      }
      case "git.switch_branch": {
        const current = await currentBranchName(cwd);
        return current === branch
          ? { status: "VERIFIED", result: { current }, evidence: [] }
          : { status: "NOT_APPLIED", result: { current }, evidence: [] };
      }
      case "git.stage_paths": {
        const staged = await runGit({
          args: ["diff", "--cached", "--name-only"],
          cwd,
        });
        const stagedSet = new Set(
          staged.stdout
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean)
        );
        const expected =
          JSON.parse(intent.canonicalPayload || "{}").paths || [];
        return expected.every((p) => stagedSet.has(p))
          ? {
              status: "VERIFIED",
              result: { staged: [...stagedSet] },
              evidence: [],
            }
          : { status: "NOT_APPLIED", result: {}, evidence: [] };
      }
      case "git.commit_local": {
        const sha = await branchHeadSha(cwd, branch);
        const matches =
          sha !== "UNBORN" && executionResult?.result?.commitSha === sha;
        return matches
          ? {
              status: "VERIFIED",
              result: { sha },
              evidence: [{ type: "git-rev-parse", sha }],
            }
          : { status: "NOT_APPLIED", result: { sha }, evidence: [] };
      }
      case "git.push_feature_branch": {
        const expectedSha = executionResult?.result?.pushedSha;
        const remoteSha = await remoteBranchSha(
          cwd,
          target.remoteName,
          target.remoteBranch
        );
        if (remoteSha === null)
          return {
            status: "UNKNOWN",
            result: { reason: "remote unreachable" },
            evidence: [],
          };
        return remoteSha === expectedSha
          ? {
              status: "VERIFIED",
              result: { remoteSha },
              evidence: [{ type: "git-ls-remote", remoteSha }],
            }
          : { status: "NOT_APPLIED", result: { remoteSha }, evidence: [] };
      }
      default:
        return { status: "UNKNOWN", result: {}, evidence: [] };
    }
  }

  async reconcile(intent) {
    const { repositoryId, branch } = parseResourceId(intent.resourceId);
    const repository = await resolveBoundRepository(repositoryId, this.db);
    const cwd = repository.canonicalRoot;
    const target = JSON.parse(intent.canonicalTarget || "{}");
    switch (intent.capabilityKey) {
      case "git.create_branch": {
        const sha = await branchHeadSha(cwd, branch);
        return { status: sha === "UNBORN" ? "NOT_APPLIED" : "VERIFIED" };
      }
      case "git.switch_branch": {
        const current = await currentBranchName(cwd);
        return { status: current === branch ? "VERIFIED" : "NOT_APPLIED" };
      }
      case "git.stage_paths": {
        const staged = await runGit({
          args: ["diff", "--cached", "--name-only"],
          cwd,
        });
        const stagedSet = new Set(
          staged.stdout
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean)
        );
        const expected =
          JSON.parse(intent.canonicalPayload || "{}").paths || [];
        return {
          status: expected.every((p) => stagedSet.has(p))
            ? "VERIFIED"
            : "NOT_APPLIED",
        };
      }
      case "git.commit_local": {
        const sha = await branchHeadSha(cwd, branch);
        return {
          status:
            sha !== "UNBORN" && sha !== intent.resourceVersion
              ? "VERIFIED"
              : "NOT_APPLIED",
        };
      }
      case "git.push_feature_branch": {
        const expectedSha = intent.resourceVersion;
        const remoteSha = await remoteBranchSha(
          cwd,
          target.remoteName,
          target.remoteBranch
        );
        if (remoteSha === null)
          throw new Error("Remote unreachable during reconciliation.");
        return {
          status: remoteSha === expectedSha ? "VERIFIED" : "NOT_APPLIED",
        };
      }
      default:
        return { status: "NOT_APPLIED" };
    }
  }
}

module.exports = { LocalGitAdapter, CAPABILITIES };
