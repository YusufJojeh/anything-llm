const { YusufOSError, ErrorCodes } = require("../../errors/YusufOSError");
const { MEMORY_SCOPES, PRINCIPAL_TYPES } = require("../../constants");

/**
 * Proves the acting principal actually owns the Memory scope it targeted.
 * `scope`/`scopeRef` are chosen by the caller (an Agent's tool arguments);
 * this is the check that stops an Agent from reading or writing another
 * Agent's, task's, or project's Memory by guessing its identifier — the same
 * role `assertRepositoryMatchesTask` plays for git/project capabilities.
 *
 * PERSONAL is a hard rule, not an unused grant: no code path today grants any
 * Agent role `memory.read`/`memory.write` with PERSONAL reachable, and this
 * function refuses it outright regardless of grants, so a future careless
 * grant cannot silently open it.
 */
async function assertScopeOwnership({ scope, scopeRef }, intent, db) {
  if (!Object.values(MEMORY_SCOPES).includes(scope))
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `Unknown memory scope: ${scope}`,
      { status: 422 }
    );

  if (scope === MEMORY_SCOPES.PERSONAL) {
    if (intent.requestedByPrincipalType !== PRINCIPAL_TYPES.USER)
      throw new YusufOSError(
        ErrorCodes.ACTION_FORBIDDEN,
        "PERSONAL-scoped memory is reachable only by the USER principal, never an Agent.",
        { status: 403, details: { reason: "SCOPE_FORBIDDEN_FOR_AGENT" } }
      );
    return;
  }

  if (scope === MEMORY_SCOPES.AGENT) {
    if (!intent.agentId)
      throw new YusufOSError(
        ErrorCodes.ACTION_FORBIDDEN,
        "AGENT-scoped memory requires an acting Agent.",
        { status: 403 }
      );
    const agent = await db.yusuf_agents.findUnique({
      where: { id: Number(intent.agentId) },
      select: { uuid: true },
    });
    if (!agent || agent.uuid !== scopeRef)
      throw new YusufOSError(
        ErrorCodes.ACTION_FORBIDDEN,
        "An Agent may only access its own AGENT-scoped memory.",
        { status: 403, details: { reason: "SCOPE_NOT_OWNED" } }
      );
    return;
  }

  if (scope === MEMORY_SCOPES.TASK || scope === MEMORY_SCOPES.CONVERSATION) {
    if (!intent.taskId)
      throw new YusufOSError(
        ErrorCodes.ACTION_FORBIDDEN,
        `${scope}-scoped memory requires a bound task.`,
        { status: 403 }
      );
    const task = await db.yusuf_tasks.findUnique({
      where: { id: Number(intent.taskId) },
      select: { uuid: true },
    });
    if (!task || task.uuid !== scopeRef)
      throw new YusufOSError(
        ErrorCodes.ACTION_FORBIDDEN,
        `An Agent may only access ${scope}-scoped memory for the task its run is bound to.`,
        { status: 403, details: { reason: "SCOPE_NOT_OWNED" } }
      );
    return;
  }

  if (scope === MEMORY_SCOPES.PROJECT) {
    if (!intent.taskId)
      throw new YusufOSError(
        ErrorCodes.ACTION_FORBIDDEN,
        "PROJECT-scoped memory requires a bound task.",
        { status: 403 }
      );
    const task = await db.yusuf_tasks.findUnique({
      where: { id: Number(intent.taskId) },
      select: { projectId: true },
    });
    if (!task || task.projectId === null)
      throw new YusufOSError(
        ErrorCodes.ACTION_FORBIDDEN,
        "PROJECT-scoped memory requires a task bound to a project.",
        { status: 403 }
      );
    const project = await db.yusuf_projects.findUnique({
      where: { id: Number(task.projectId) },
      select: { uuid: true },
    });
    if (!project || project.uuid !== scopeRef)
      throw new YusufOSError(
        ErrorCodes.ACTION_FORBIDDEN,
        "An Agent may only access PROJECT-scoped memory for the project its task belongs to.",
        { status: 403, details: { reason: "SCOPE_NOT_OWNED" } }
      );
    return;
  }
}

module.exports = { assertScopeOwnership };
