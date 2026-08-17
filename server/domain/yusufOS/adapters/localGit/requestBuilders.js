const prisma = require("../../../../utils/prisma");
const { YusufOSError, ErrorCodes } = require("../../errors/YusufOSError");
const { resolveBoundRepository } = require("./repositoryIdentity");
const { buildResource, buildTarget } = require("./shapes");
const {
  branchHeadSha,
  currentBranchName,
  remoteFingerprint,
} = require("./snapshot");
const {
  assertValidBranchName,
  assertValidRevision,
  isProtectedBranch,
} = require("./branchPolicy");
const { assertStagingPathsAllowed } = require("./pathPolicy");

const MAX_COMMIT_MESSAGE_LENGTH = 4000;

async function requireCheckedOutBranch(repository) {
  const branch = await currentBranchName(repository.canonicalRoot);
  if (!branch)
    throw new YusufOSError(
      ErrorCodes.ACTION_FORBIDDEN,
      "The repository has a detached HEAD; a governed local write requires a named branch.",
      { status: 403 }
    );
  return branch;
}

/** git.read_status / git.read_diff / git.read_log / git.read_show */
async function buildReadRequest(capabilityKey, args = {}, db = prisma) {
  const repository = await resolveBoundRepository(args.repositoryId, db);
  const branch = args.branch
    ? assertValidBranchName(args.branch, "branch")
    : await requireCheckedOutBranch(repository);
  const version = await branchHeadSha(repository.canonicalRoot, branch);
  const payload = {};
  if (capabilityKey === "git.read_diff")
    payload.ref = args.ref ? assertValidRevision(args.ref, "ref") : "HEAD";
  if (capabilityKey === "git.read_log") {
    payload.ref = args.ref ? assertValidRevision(args.ref, "ref") : "HEAD";
    payload.maxCount = Math.min(Math.max(Number(args.maxCount) || 20, 1), 200);
  }
  if (capabilityKey === "git.read_show")
    payload.ref = assertValidRevision(args.ref, "ref");
  return {
    resource: buildResource({ repositoryId: repository.uuid, branch, version }),
    target: buildTarget({ repositoryId: repository.uuid, branch }),
    payload,
    environment: "LOCAL",
  };
}

async function buildCreateBranchRequest(args = {}, db = prisma) {
  const repository = await resolveBoundRepository(args.repositoryId, db);
  if (!repository.allowLocalCommit)
    throw new YusufOSError(
      ErrorCodes.ACTION_FORBIDDEN,
      "This repository binding does not permit local writes.",
      { status: 403 }
    );
  const newBranch = assertValidBranchName(args.newBranch, "newBranch");
  if (isProtectedBranch(newBranch, repository.protectedBranches))
    throw new YusufOSError(
      ErrorCodes.ACTION_FORBIDDEN,
      "A protected branch name cannot be (re)created by a governed action.",
      { status: 403 }
    );
  const fromRef = args.fromRef
    ? assertValidRevision(args.fromRef, "fromRef")
    : "HEAD";
  const version = await branchHeadSha(repository.canonicalRoot, newBranch);
  return {
    resource: buildResource({
      repositoryId: repository.uuid,
      branch: newBranch,
      version,
    }),
    target: buildTarget({ repositoryId: repository.uuid, branch: newBranch }),
    payload: { fromRef },
    environment: "LOCAL",
  };
}

async function buildSwitchBranchRequest(args = {}, db = prisma) {
  const repository = await resolveBoundRepository(args.repositoryId, db);
  if (!repository.allowLocalCommit)
    throw new YusufOSError(
      ErrorCodes.ACTION_FORBIDDEN,
      "This repository binding does not permit local writes.",
      { status: 403 }
    );
  const toBranch = assertValidBranchName(args.toBranch, "toBranch");
  if (isProtectedBranch(toBranch, repository.protectedBranches))
    throw new YusufOSError(
      ErrorCodes.ACTION_FORBIDDEN,
      "Switching onto a protected branch is not a governed local write.",
      { status: 403 }
    );
  const version = await branchHeadSha(repository.canonicalRoot, toBranch);
  return {
    resource: buildResource({
      repositoryId: repository.uuid,
      branch: toBranch,
      version,
    }),
    target: buildTarget({ repositoryId: repository.uuid, branch: toBranch }),
    payload: {},
    environment: "LOCAL",
  };
}

async function buildStagePathsRequest(args = {}, db = prisma) {
  const repository = await resolveBoundRepository(args.repositoryId, db);
  if (!repository.allowLocalCommit)
    throw new YusufOSError(
      ErrorCodes.ACTION_FORBIDDEN,
      "This repository binding does not permit local writes.",
      { status: 403 }
    );
  const branch = await requireCheckedOutBranch(repository);
  if (isProtectedBranch(branch, repository.protectedBranches))
    throw new YusufOSError(
      ErrorCodes.ACTION_FORBIDDEN,
      "Staging on a protected branch is not a governed local write.",
      { status: 403 }
    );
  const paths = assertStagingPathsAllowed(repository.canonicalRoot, args.paths);
  const version = await branchHeadSha(repository.canonicalRoot, branch);
  return {
    resource: buildResource({ repositoryId: repository.uuid, branch, version }),
    target: buildTarget({ repositoryId: repository.uuid, branch }),
    payload: { paths },
    environment: "LOCAL",
  };
}

async function buildCommitLocalRequest(args = {}, db = prisma) {
  const repository = await resolveBoundRepository(args.repositoryId, db);
  if (!repository.allowLocalCommit)
    throw new YusufOSError(
      ErrorCodes.ACTION_FORBIDDEN,
      "This repository binding does not permit local writes.",
      { status: 403 }
    );
  const branch = await requireCheckedOutBranch(repository);
  if (isProtectedBranch(branch, repository.protectedBranches))
    throw new YusufOSError(
      ErrorCodes.ACTION_FORBIDDEN,
      "A commit directly on a protected branch is never a governed local write.",
      { status: 403 }
    );
  if (
    typeof args.message !== "string" ||
    args.message.trim().length === 0 ||
    args.message.includes("\0") ||
    args.message.length > MAX_COMMIT_MESSAGE_LENGTH
  )
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      "message must be a non-empty string without a null byte, within the length limit.",
      { status: 422 }
    );
  const version = await branchHeadSha(repository.canonicalRoot, branch);
  return {
    resource: buildResource({ repositoryId: repository.uuid, branch, version }),
    target: buildTarget({ repositoryId: repository.uuid, branch }),
    payload: { message: args.message },
    environment: "LOCAL",
  };
}

async function buildPushFeatureBranchRequest(args = {}, db = prisma) {
  const repository = await resolveBoundRepository(args.repositoryId, db);
  if (!repository.allowFeaturePush)
    throw new YusufOSError(
      ErrorCodes.ACTION_FORBIDDEN,
      "This repository binding does not permit feature-branch push.",
      { status: 403 }
    );
  const branch = args.branch
    ? assertValidBranchName(args.branch, "branch")
    : await requireCheckedOutBranch(repository);
  const remoteBranch = args.remoteBranch
    ? assertValidBranchName(args.remoteBranch, "remoteBranch")
    : branch;
  // First line of defense: this builder can never even produce an intent
  // that would write to a protected ref. The *destination* (remoteBranch)
  // is what a push actually mutates on the remote and must be checked, not
  // just the local source branch — a caller could otherwise push an
  // unprotected local branch straight onto the remote's protected branch by
  // setting remoteBranch alone. The independent, code-owned guarantee that
  // such a push is FORBIDDEN (not merely undiscoverable) lives in the
  // capability registry's HARD_FORBIDDEN set (protected_branch.direct_push /
  // .force_push) and is proven directly against Policy in the test suite,
  // not routed through this builder — see KNOWN_RISKS.md for why.
  if (
    isProtectedBranch(branch, repository.protectedBranches) ||
    isProtectedBranch(remoteBranch, repository.protectedBranches)
  )
    throw new YusufOSError(
      ErrorCodes.ACTION_FORBIDDEN,
      "Pushing directly to a protected branch is forbidden.",
      { status: 403 }
    );
  const version = await branchHeadSha(repository.canonicalRoot, branch);
  if (version === "UNBORN")
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      "The branch has no commits to push.",
      { status: 422 }
    );
  const accountIdentity = await remoteFingerprint(
    repository.canonicalRoot,
    repository.allowedRemoteName
  );
  if (!accountIdentity)
    throw new YusufOSError(
      ErrorCodes.ACTION_FORBIDDEN,
      "The repository's allowed remote is not configured.",
      { status: 403 }
    );
  return {
    resource: buildResource({ repositoryId: repository.uuid, branch, version }),
    target: buildTarget({
      repositoryId: repository.uuid,
      branch,
      remoteName: repository.allowedRemoteName,
      remoteBranch,
      accountIdentity,
    }),
    payload: { remoteBranch },
    environment: "LOCAL",
  };
}

module.exports = {
  buildReadRequest,
  buildCreateBranchRequest,
  buildSwitchBranchRequest,
  buildStagePathsRequest,
  buildCommitLocalRequest,
  buildPushFeatureBranchRequest,
};
