const fs = require("fs");
const path = require("path");
const prisma = require("../../../../utils/prisma");
const { YusufOSError, ErrorCodes } = require("../../errors/YusufOSError");

/**
 * The existence of Git on disk never authorizes an Agent to operate on a
 * repository by itself. A capability's `resource.id` names a
 * `yusuf_git_repositories` row by uuid; this resolves that binding and
 * re-proves, right now, that the bound path is still a real repository at
 * the exact canonical root recorded when it was registered — not merely
 * that *some* repository exists at a lexically similar path.
 */
async function resolveBoundRepository(repositoryUuid, db = prisma) {
  if (typeof repositoryUuid !== "string" || repositoryUuid.length === 0)
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      "repositoryId is required.",
      { status: 422 }
    );
  const binding = await db.yusuf_git_repositories.findUnique({
    where: { uuid: repositoryUuid },
  });
  if (!binding || binding.status !== "ACTIVE")
    throw new YusufOSError(
      ErrorCodes.ACTION_FORBIDDEN,
      "No active repository binding exists for this identifier. Git access requires project-owned registration.",
      { status: 403 }
    );

  let realRoot;
  try {
    realRoot = fs.realpathSync.native(binding.canonicalRoot);
  } catch {
    throw new YusufOSError(
      ErrorCodes.ACTION_FORBIDDEN,
      "The bound repository root is no longer present on disk.",
      { status: 403 }
    );
  }
  if (realRoot !== binding.canonicalRoot)
    throw new YusufOSError(
      ErrorCodes.ACTION_FORBIDDEN,
      "The bound repository root has been replaced by a symlink or junction since registration.",
      { status: 403 }
    );
  if (!fs.existsSync(path.join(realRoot, ".git")))
    throw new YusufOSError(
      ErrorCodes.ACTION_FORBIDDEN,
      "The bound repository root no longer contains a Git repository.",
      { status: 403 }
    );

  return {
    ...binding,
    protectedBranches: JSON.parse(binding.protectedBranches || "[]"),
  };
}

/**
 * Registers a repository binding. `canonicalRoot` must already be a real,
 * symlink-resolved path — callers pass through `fs.realpathSync.native`
 * first so the uniqueness constraint actually prevents two bindings from
 * quietly aliasing the same directory via different link paths.
 */
async function registerRepository(
  {
    projectId,
    key,
    root,
    defaultBranch,
    protectedBranches,
    allowedRemoteName,
    allowedRemoteIdentity,
    allowLocalCommit,
    allowFeaturePush,
  },
  db = prisma
) {
  let realRoot;
  try {
    realRoot = fs.realpathSync.native(root);
  } catch {
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      "root must be an existing directory.",
      { status: 422 }
    );
  }
  if (!fs.existsSync(path.join(realRoot, ".git")))
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      "root must contain an initialized Git repository.",
      { status: 422 }
    );
  const {
    YusufGitRepository,
  } = require("../../../../models/yusufOS/gitRepository");
  return YusufGitRepository.create(
    {
      projectId,
      key,
      canonicalRoot: realRoot,
      defaultBranch,
      protectedBranches,
      allowedRemoteName,
      allowedRemoteIdentity,
      allowLocalCommit,
      allowFeaturePush,
    },
    db
  );
}

/**
 * Proves the repository an Agent targeted actually belongs to the project that
 * owns the intent's task.
 *
 * `repositoryId` is chosen by the Agent, and a binding lookup alone only proves
 * the binding exists — not that it is *this* task's repository. Without this
 * check an Agent working in a permissive project could read, write, run
 * commands in, or push from a different project's repository, and Policy would
 * evaluate that action against the wrong project's overrides (PolicyEngine
 * resolves project restrictions from `intent.task.projectId`, not from the
 * repository actually being touched).
 */
async function assertRepositoryMatchesTask(binding, intent, db = prisma) {
  if (!intent?.taskId) return binding;
  const task = await db.yusuf_tasks.findUnique({
    where: { id: Number(intent.taskId) },
    select: { projectId: true },
  });
  // A task with no project is unscoped and has no "other project" to confuse
  // it with — that is Gate D's original model and remains reachable only from
  // server-side task creation, never from an Agent. The cross-project attack
  // this guards against requires the task to belong to a project, so the
  // comparison is enforced exactly when there is something to compare.
  if (!task || task.projectId === null) return binding;
  if (Number(task.projectId) !== Number(binding.projectId))
    throw new YusufOSError(
      ErrorCodes.ACTION_FORBIDDEN,
      "The requested repository belongs to a different project than this task.",
      {
        status: 403,
        details: {
          taskProjectId: task.projectId,
          repositoryProjectId: binding.projectId,
        },
      }
    );
  return binding;
}

module.exports = {
  resolveBoundRepository,
  registerRepository,
  assertRepositoryMatchesTask,
};
