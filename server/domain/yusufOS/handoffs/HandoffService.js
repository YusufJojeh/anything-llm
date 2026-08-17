const { randomUUID } = require("crypto");
const prisma = require("../../../utils/prisma");
const {
  HANDOFF_STATUSES,
  PRINCIPAL_TYPES,
  AGENT_KEYS,
} = require("../constants");
const { AuditService } = require("../audit/AuditService");
const { canonicalHash } = require("../security/canonicalJson");
const { redactForPersistence } = require("../security/redaction");
const { YusufOSError, ErrorCodes } = require("../errors/YusufOSError");

// Which role may hand off to which. Code-owned so that a compromised prompt
// cannot invent a delegation edge (e.g. Engineering handing work to itself to
// skip review, or an Agent creating a handoff "from" the Reviewer).
const ALLOWED_HANDOFFS = Object.freeze([
  `${AGENT_KEYS.CHIEF_OF_STAFF}->${AGENT_KEYS.ENGINEERING}`,
  `${AGENT_KEYS.CHIEF_OF_STAFF}->${AGENT_KEYS.REVIEWER}`,
  `${AGENT_KEYS.ENGINEERING}->${AGENT_KEYS.REVIEWER}`,
  `${AGENT_KEYS.REVIEWER}->${AGENT_KEYS.ENGINEERING}`,
]);

class HandoffService {
  constructor(db = prisma) {
    this.db = db;
    this.audit = new AuditService(db);
  }

  /**
   * Creates a durable handoff.
   *
   * `actingAgentId` is the run-owned identity of whoever is creating this
   * edge, supplied by the server-side coordinator — never by model output. It
   * must equal `fromAgentId`, which is what stops an Agent from forging a
   * handoff that appears to originate from another Agent.
   *
   * Idempotent: the same logical handoff (task + from + to + reason + fromRun)
   * yields one row, so an at-least-once orchestration retry cannot create
   * duplicate review work.
   */
  async create({
    taskId,
    fromAgentId,
    toAgentId,
    fromRunId = null,
    reason,
    artifacts = [],
    actingAgentId,
    requestId,
  }) {
    if (Number(actingAgentId) !== Number(fromAgentId))
      throw new YusufOSError(
        ErrorCodes.UNAUTHORIZED,
        "An Agent may only create a handoff originating from itself.",
        { status: 403, details: { actingAgentId, fromAgentId } }
      );
    if (Number(fromAgentId) === Number(toAgentId))
      throw new YusufOSError(
        ErrorCodes.VALIDATION_ERROR,
        "A handoff must move work between two different Agents.",
        { status: 422 }
      );
    if (typeof reason !== "string" || reason.trim().length === 0)
      throw new YusufOSError(
        ErrorCodes.VALIDATION_ERROR,
        "A handoff requires an explicit reason.",
        { status: 422 }
      );

    const [fromAgent, toAgent] = await Promise.all([
      this.db.yusuf_agents.findUnique({ where: { id: Number(fromAgentId) } }),
      this.db.yusuf_agents.findUnique({ where: { id: Number(toAgentId) } }),
    ]);
    if (!fromAgent || !toAgent)
      throw new YusufOSError(ErrorCodes.NOT_FOUND, "Handoff agent not found.", {
        status: 404,
      });
    const edge = `${fromAgent.key}->${toAgent.key}`;
    if (!ALLOWED_HANDOFFS.includes(edge))
      throw new YusufOSError(
        ErrorCodes.ACTION_FORBIDDEN,
        `Handoff ${edge} is not an allowed delegation edge.`,
        { status: 403, details: { edge } }
      );

    const idempotencyKey = canonicalHash({
      taskId: Number(taskId),
      fromAgentId: Number(fromAgentId),
      toAgentId: Number(toAgentId),
      fromRunId: fromRunId ? Number(fromRunId) : null,
      reason,
    });

    try {
      const handoff = await this.db.$transaction(async (tx) => {
        const created = await tx.yusuf_handoffs.create({
          data: {
            uuid: randomUUID(),
            taskId: Number(taskId),
            fromAgentId: Number(fromAgentId),
            toAgentId: Number(toAgentId),
            fromRunId: fromRunId ? Number(fromRunId) : null,
            reason,
            status: HANDOFF_STATUSES.PENDING,
            artifacts: JSON.stringify(redactForPersistence(artifacts)),
            idempotencyKey,
            requestId,
          },
        });
        await this.audit.appendInTransaction(tx, {
          eventType: "handoff.created",
          principal: { type: PRINCIPAL_TYPES.AGENT, id: fromAgent.uuid },
          taskRef: taskId,
          runRef: fromRunId,
          outcome: HANDOFF_STATUSES.PENDING,
          metadata: { edge, reason, handoffId: created.uuid },
          requestId,
        });
        return created;
      });
      return handoff;
    } catch (error) {
      if (error?.code !== "P2002") throw error;
      return this.db.yusuf_handoffs.findUnique({ where: { idempotencyKey } });
    }
  }

  /** Only the receiving Agent may accept its own handoff. */
  async accept({ handoffId, acceptingAgentId, toRunId, requestId }) {
    const handoff = await this.db.yusuf_handoffs.findUnique({
      where: { id: Number(handoffId) },
    });
    if (!handoff)
      throw new YusufOSError(ErrorCodes.NOT_FOUND, "Handoff not found.", {
        status: 404,
      });
    if (Number(handoff.toAgentId) !== Number(acceptingAgentId))
      throw new YusufOSError(
        ErrorCodes.UNAUTHORIZED,
        "Only the receiving Agent may accept this handoff.",
        { status: 403 }
      );
    const updated = await this.db.yusuf_handoffs.updateMany({
      where: {
        id: handoff.id,
        status: HANDOFF_STATUSES.PENDING,
        version: handoff.version,
      },
      data: {
        status: HANDOFF_STATUSES.ACCEPTED,
        toRunId: toRunId ? Number(toRunId) : null,
        acceptedAt: new Date(),
        version: { increment: 1 },
      },
    });
    if (updated.count !== 1)
      throw new YusufOSError(
        ErrorCodes.CONFLICT,
        "Handoff was already accepted or changed concurrently.",
        { status: 409 }
      );
    await this.audit.append({
      eventType: "handoff.accepted",
      principal: { type: PRINCIPAL_TYPES.SYSTEM, id: "handoff-service" },
      taskRef: handoff.taskId,
      runRef: toRunId,
      outcome: HANDOFF_STATUSES.ACCEPTED,
      metadata: { handoffId: handoff.uuid },
      requestId: requestId || handoff.requestId,
    });
    return this.db.yusuf_handoffs.findUnique({ where: { id: handoff.id } });
  }

  async complete({ handoffId, requestId }) {
    const handoff = await this.db.yusuf_handoffs.findUnique({
      where: { id: Number(handoffId) },
    });
    if (!handoff)
      throw new YusufOSError(ErrorCodes.NOT_FOUND, "Handoff not found.", {
        status: 404,
      });
    const updated = await this.db.yusuf_handoffs.updateMany({
      where: {
        id: handoff.id,
        status: HANDOFF_STATUSES.ACCEPTED,
        version: handoff.version,
      },
      data: {
        status: HANDOFF_STATUSES.COMPLETED,
        completedAt: new Date(),
        version: { increment: 1 },
      },
    });
    if (updated.count !== 1)
      throw new YusufOSError(
        ErrorCodes.CONFLICT,
        "Only an accepted handoff can be completed.",
        { status: 409 }
      );
    await this.audit.append({
      eventType: "handoff.completed",
      principal: { type: PRINCIPAL_TYPES.SYSTEM, id: "handoff-service" },
      taskRef: handoff.taskId,
      outcome: HANDOFF_STATUSES.COMPLETED,
      metadata: { handoffId: handoff.uuid },
      requestId: requestId || handoff.requestId,
    });
    return this.db.yusuf_handoffs.findUnique({ where: { id: handoff.id } });
  }

  listForTask(taskId) {
    return this.db.yusuf_handoffs.findMany({
      where: { taskId: Number(taskId) },
      orderBy: { createdAt: "asc" },
    });
  }

  pendingFor(agentId) {
    return this.db.yusuf_handoffs.findMany({
      where: { toAgentId: Number(agentId), status: HANDOFF_STATUSES.PENDING },
      orderBy: { createdAt: "asc" },
    });
  }
}

module.exports = { HandoffService, ALLOWED_HANDOFFS };
