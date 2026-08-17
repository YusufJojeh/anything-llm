const RESOURCE_TYPE = "GIT_BRANCH_HEAD";

/**
 * The exact object shapes intent creation (buildActionRequest) and adapter
 * preflight both build from. Centralized so the two independent call sites
 * can never drift into producing structurally different objects that would
 * make canonicalHash comparisons fail for a legitimately unchanged state.
 */
function buildResource({ repositoryId, branch, version }) {
  return { type: RESOURCE_TYPE, id: `${repositoryId}:${branch}`, version };
}

function buildTarget({
  repositoryId,
  branch,
  remoteName = null,
  remoteBranch = null,
  accountIdentity = null,
}) {
  return { repositoryId, branch, remoteName, remoteBranch, accountIdentity };
}

function parseResourceId(resourceId) {
  const separatorIndex = resourceId.indexOf(":");
  return {
    repositoryId: resourceId.slice(0, separatorIndex),
    branch: resourceId.slice(separatorIndex + 1),
  };
}

module.exports = { RESOURCE_TYPE, buildResource, buildTarget, parseResourceId };
