const prisma = require("../../../utils/prisma");
const { canonicalizeActionRequest } = require("./IntentCanonicalizer");
const { INTENT_STATUSES } = require("../constants");
const { AuditService } = require("../audit/AuditService");
const { PRINCIPAL_TYPES } = require("../constants");
const { YusufOSError, ErrorCodes } = require("../errors/YusufOSError");

class IntentService {
  constructor(db = prisma) {
    this.db = db;
    this.audit = new AuditService(db);
  }

  async create(request, { requestId } = {}) {
    const canonical = canonicalizeActionRequest(request, { requestId });
    try {
      return await this.db.$transaction(async (tx) => {
        const run = await tx.yusuf_agent_runs.findUnique({
          where: { id: canonical.runId },
          include: { agent: true, task: true },
        });
        const ownershipMismatch =
          !run ||
          run.taskId !== canonical.taskId ||
          run.agentId !== canonical.agentId ||
          (run.task.assignedAgentId !== null &&
            run.task.assignedAgentId !== canonical.agentId);
        const principalMismatch =
          canonical.principal.type === PRINCIPAL_TYPES.AGENT
            ? !run?.agent || run.agent.uuid !== canonical.principal.id
            : run?.requestedByPrincipalType !== canonical.principal.type ||
              run?.requestedByPrincipalId !== canonical.principal.id;
        if (ownershipMismatch || principalMismatch)
          throw new YusufOSError(
            ErrorCodes.POLICY_DENIED,
            "Runtime principal, Agent, Task, and Run ownership do not match.",
            { status: 403 }
          );
        const intent = await tx.yusuf_action_intents.create({
          data: {
            uuid: canonical.uuid,
            taskId: canonical.taskId,
            runId: canonical.runId,
            agentId: canonical.agentId,
            requestedByPrincipalType: canonical.principal.type,
            requestedByPrincipalId: canonical.principal.id,
            capabilityKey: canonical.capability.key,
            capabilityVersion: canonical.capability.version,
            resourceType: canonical.resource.type,
            resourceId: canonical.resource.id,
            resourceVersion: canonical.resource.version,
            environment: canonical.environment,
            canonicalTarget: canonical.canonicalTarget,
            canonicalPayload: canonical.canonicalPayload,
            canonicalPreconditions: canonical.canonicalPreconditions,
            targetIdentityDigest: canonical.targetIdentityDigest,
            accountIdentityDigest: canonical.accountIdentityDigest,
            payloadHash: canonical.payloadHash,
            intentFingerprint: canonical.intentFingerprint,
            canonicalizationVersion: canonical.canonicalizationVersion,
            status: INTENT_STATUSES.INTENT_CREATED,
            requestId: canonical.requestId,
            expiresAt: canonical.expiresAt,
          },
        });
        await this.audit.appendInTransaction(tx, {
          eventType: "intent.created",
          principal: canonical.principal,
          taskRef: canonical.taskId,
          runRef: canonical.runId,
          intentRef: intent.uuid,
          resource: canonical.resource,
          outcome: INTENT_STATUSES.INTENT_CREATED,
          metadata: {
            capabilityKey: canonical.capability.key,
            capabilityVersion: canonical.capability.version,
            payloadHash: canonical.payloadHash,
            targetIdentityDigest: canonical.targetIdentityDigest,
          },
          requestId: canonical.requestId,
        });
        return intent;
      });
    } catch (error) {
      if (error?.code !== "P2002") throw error;
      const existing = await this.db.yusuf_action_intents.findUnique({
        where: { intentFingerprint: canonical.intentFingerprint },
      });
      if (existing) return existing;
      throw error;
    }
  }

  get(where) {
    return this.db.yusuf_action_intents.findFirst({ where });
  }
}

module.exports = { IntentService };
