const prisma = require("../../../../utils/prisma");
const { YusufOSError, ErrorCodes } = require("../../errors/YusufOSError");

// The only executables a project-registered command is allowed to name. This
// is a code-owned allowlist, not project configuration: a DB row can choose
// *which* of these to use and with which server-stored argv, but it can never
// introduce a new executable (e.g. a shell) that this list does not contain.
//
// Deliberately limited to real binaries. npm/npx/yarn are NOT here: on Windows
// they are `.cmd` shims that cannot be launched with `shell: false`, and
// enabling a shell to reach them would reintroduce exactly the shell-injection
// surface this registry exists to avoid. A future gate that needs them must
// resolve the concrete binary rather than relaxing `shell`.
const ALLOWED_EXECUTABLES = Object.freeze(["node", "git"]);

// Semantic keys an Agent may request. The model picks one of these strings and
// nothing else — never an executable, argv, cwd, or environment.
const SEMANTIC_COMMAND_KEYS = Object.freeze([
  "project.run_tests",
  "project.run_lint",
  "project.run_build",
]);

function assertSemanticKey(key) {
  if (!SEMANTIC_COMMAND_KEYS.includes(key))
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      "commandKey must be one of the registered semantic command keys.",
      { status: 422, details: { allowed: SEMANTIC_COMMAND_KEYS } }
    );
  return key;
}

function assertAllowedExecutable(executable) {
  if (!ALLOWED_EXECUTABLES.includes(executable))
    throw new YusufOSError(
      ErrorCodes.ACTION_FORBIDDEN,
      "A project command may not name an executable outside the code-owned allowlist.",
      { status: 403, details: { allowed: ALLOWED_EXECUTABLES } }
    );
  return executable;
}

/**
 * Resolves a semantic key to its exact server-owned invocation. Every field
 * an attacker would want to control — executable, argv, cwd, timeout — comes
 * from this row, never from the caller.
 */
async function resolveProjectCommand(projectId, commandKey, db = prisma) {
  assertSemanticKey(commandKey);
  const row = await db.yusuf_project_commands.findUnique({
    where: {
      projectId_key: { projectId: Number(projectId), key: commandKey },
    },
  });
  if (!row || !row.enabled)
    throw new YusufOSError(
      ErrorCodes.ACTION_FORBIDDEN,
      "This project has no enabled registration for that command key.",
      { status: 403, details: { commandKey } }
    );
  assertAllowedExecutable(row.executable);
  const args = JSON.parse(row.args || "[]");
  if (!Array.isArray(args) || args.some((a) => typeof a !== "string"))
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      "Registered command arguments are malformed.",
      { status: 422 }
    );
  return {
    key: row.key,
    executable: row.executable,
    args,
    cwdRelative: row.cwdRelative || ".",
    timeoutMs: Math.min(
      Math.max(Number(row.timeoutMs) || 120000, 1000),
      600000
    ),
    version: row.version,
  };
}

async function registerProjectCommand(
  { projectId, key, description, executable, args, cwdRelative, timeoutMs },
  db = prisma
) {
  assertSemanticKey(key);
  assertAllowedExecutable(executable);
  const { randomUUID } = require("crypto");
  return db.yusuf_project_commands.create({
    data: {
      uuid: randomUUID(),
      projectId: Number(projectId),
      key,
      description: description || "",
      executable,
      args: JSON.stringify(args || []),
      cwdRelative: cwdRelative || ".",
      timeoutMs: timeoutMs || 120000,
    },
  });
}

module.exports = {
  ALLOWED_EXECUTABLES,
  SEMANTIC_COMMAND_KEYS,
  assertSemanticKey,
  assertAllowedExecutable,
  resolveProjectCommand,
  registerProjectCommand,
};
