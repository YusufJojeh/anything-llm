const prisma = require("../../../utils/prisma");
const {
  APPROVAL_STATUSES,
  INTENT_STATUSES,
  POLICY_OUTCOMES,
  RISK_LEVELS,
  PRINCIPAL_TYPES,
} = require("../constants");
const { assertHumanPrincipal } = require("../identity/principals");
const { getCapability, isHardForbidden } = require("../capabilities/registry");
const { AuditService } = require("../audit/AuditService");
const { SecuritySettings } = require("../security/SecuritySettings");
const { YusufOSError, ErrorCodes } = require("../errors/YusufOSError");
const { redactString } = require("../security/redaction");

class ApprovalService {
  constructor(db = prisma) {
    this.db = db;
    this.audit = new AuditService(db);
    this.securitySettings = new SecuritySettings(db);
  }

  async decide(
    approvalId,
    {
      decision,
      expectedPayloadHash,
      expectedIntentVersion,
      expectedApprovalVersion,
      note,
      principal,
      requestId,
    }
  ) {
    const user = assertHumanPrincipal(principal);
    if (!["APPROVE", "REJECT"].includes(decision))
      throw new YusufOSError(
        ErrorCodes.VALIDATION_ERROR,
        "Decision must be APPROVE or REJECT.",
        { status: 422 }
      );
    const result = await this.db.$transaction(async (tx) => {
      const approval = await tx.yusuf_approval_requests.findUnique({
        where: { id: Number(approvalId) },
        include: { intent: true },
      });
      if (!approval)
        throw new YusufOSError(ErrorCodes.NOT_FOUND, "Approval not found.", {
          status: 404,
        });
      if (approval.status !== APPROVAL_STATUSES.PENDING)
        throw new YusufOSError(
          ErrorCodes.APPROVAL_ALREADY_DECIDED,
          "Approval is no longer pending.",
          { status: 409, details: { status: approval.status } }
        );
      if (approval.expiresAt <= new Date()) {
        await tx.yusuf_approval_requests.updateMany({
          where: {
            id: approval.id,
            status: APPROVAL_STATUSES.PENDING,
            version: approval.version,
          },
          data: {
            status: APPROVAL_STATUSES.EXPIRED,
            version: { increment: 1 },
          },
        });
        await this.audit.appendInTransaction(tx, {
          eventType: "approval.expired",
          principal: { type: PRINCIPAL_TYPES.SYSTEM, id: "approval-service" },
          intentRef: approval.intent.uuid,
          approvalRef: approval.uuid,
          outcome: APPROVAL_STATUSES.EXPIRED,
          metadata: {},
          requestId: requestId || approval.requestId,
        });
        return { expired: true };
      }
      if (
        approval.payloadHash !== expectedPayloadHash ||
        approval.intent.payloadHash !== expectedPayloadHash ||
        approval.boundIntentVersion !== Number(expectedIntentVersion) ||
        approval.intent.version !== Number(expectedIntentVersion)
      ) {
        await this.invalidateInTransaction(
          tx,
          approval,
          "BOUND_STATE_CHANGED",
          {
            principal: user,
            requestId: requestId || approval.requestId,
          }
        );
        return { invalidated: true };
      }

      const nextStatus =
        decision === "APPROVE"
          ? APPROVAL_STATUSES.APPROVED
          : APPROVAL_STATUSES.REJECTED;
      const updated = await tx.yusuf_approval_requests.updateMany({
        where: {
          id: approval.id,
          status: APPROVAL_STATUSES.PENDING,
          version: Number(expectedApprovalVersion),
          payloadHash: expectedPayloadHash,
        },
        data: {
          status: nextStatus,
          decidedAt: new Date(),
          decidedByPrincipalType: user.type,
          decidedByPrincipalId: user.id,
          decisionNote: note ? redactString(String(note).slice(0, 2000)) : null,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1)
        throw new YusufOSError(
          ErrorCodes.APPROVAL_ALREADY_DECIDED,
          "Approval was decided concurrently or its version changed.",
          { status: 409 }
        );
      if (nextStatus === APPROVAL_STATUSES.REJECTED) {
        await tx.yusuf_action_intents.updateMany({
          where: {
            id: approval.intent.id,
            status: INTENT_STATUSES.WAITING_APPROVAL,
            version: approval.intent.version,
          },
          data: {
            status: INTENT_STATUSES.CANCELLED,
            version: { increment: 1 },
          },
        });
      }
      await this.audit.appendInTransaction(tx, {
        eventType: "approval.decided",
        principal: user,
        intentRef: approval.intent.uuid,
        approvalRef: approval.uuid,
        outcome: nextStatus,
        metadata: {
          payloadHash: approval.payloadHash,
          boundIntentVersion: approval.boundIntentVersion,
        },
        requestId: requestId || approval.requestId,
      });
      return {
        approval: await tx.yusuf_approval_requests.findUnique({
          where: { id: approval.id },
        }),
      };
    });

    if (result.expired)
      throw new YusufOSError(
        ErrorCodes.APPROVAL_EXPIRED,
        "Approval expired before the decision was applied.",
        { status: 409 }
      );
    if (result.invalidated)
      throw new YusufOSError(
        ErrorCodes.APPROVAL_INVALIDATED,
        "Approval bindings no longer match the intent.",
        { status: 409 }
      );
    return result.approval;
  }

  async invalidateInTransaction(
    tx,
    approval,
    reason,
    { principal, requestId }
  ) {
    await tx.yusuf_approval_requests.updateMany({
      where: {
        id: approval.id,
        status: { in: [APPROVAL_STATUSES.PENDING, APPROVAL_STATUSES.APPROVED] },
        version: approval.version,
      },
      data: {
        status: APPROVAL_STATUSES.INVALIDATED,
        invalidatedAt: new Date(),
        invalidationReason: reason,
        version: { increment: 1 },
      },
    });
    await tx.yusuf_action_intents.updateMany({
      where: {
        id: approval.intent.id,
        status: {
          in: [INTENT_STATUSES.WAITING_APPROVAL, INTENT_STATUSES.AUTHORIZED],
        },
      },
      data: {
        status: INTENT_STATUSES.INVALIDATED,
        version: { increment: 1 },
      },
    });
    await this.audit.appendInTransaction(tx, {
      eventType: "approval.invalidated",
      principal,
      intentRef: approval.intent.uuid,
      approvalRef: approval.uuid,
      outcome: APPROVAL_STATUSES.INVALIDATED,
      metadata: { reason },
      requestId,
    });
  }

  async validateForConsumption(tx, approval, context = {}) {
    const intent = approval.intent;
    const capability = getCapability(intent.capabilityKey);
    const boundResources = JSON.parse(approval.boundResourceVersions || "[]");
    const boundResource = boundResources[0] || null;
    const preflight = context.governedPreflight;
    const requiresLivePreflight = [RISK_LEVELS.L3, RISK_LEVELS.L4].includes(
      approval.requiredRiskLevel
    );
    let invalidationReason = null;
    if (approval.status !== APPROVAL_STATUSES.APPROVED)
      throw new YusufOSError(
        ErrorCodes.APPROVAL_REQUIRED,
        "A current approved decision is required.",
        { status: 409, details: { status: approval.status } }
      );
    if (approval.expiresAt <= new Date()) {
      await tx.yusuf_approval_requests.updateMany({
        where: {
          id: approval.id,
          status: APPROVAL_STATUSES.APPROVED,
          version: approval.version,
        },
        data: {
          status: APPROVAL_STATUSES.EXPIRED,
          version: { increment: 1 },
        },
      });
      await tx.yusuf_action_intents.updateMany({
        where: {
          id: intent.id,
          status: INTENT_STATUSES.WAITING_APPROVAL,
          version: intent.version,
        },
        data: {
          status: INTENT_STATUSES.INVALIDATED,
          version: { increment: 1 },
        },
      });
      await this.audit.appendInTransaction(tx, {
        eventType: "approval.expired",
        principal: { type: PRINCIPAL_TYPES.SYSTEM, id: "approval-service" },
        intentRef: intent.uuid,
        approvalRef: approval.uuid,
        outcome: APPROVAL_STATUSES.EXPIRED,
        metadata: {},
        requestId: context.requestId || approval.requestId,
      });
      return { valid: false, expired: true, reason: "EXPIRED" };
    } else if (approval.payloadHash !== intent.payloadHash)
      invalidationReason = "PAYLOAD_CHANGED";
    else if (approval.boundIntentVersion !== intent.version)
      invalidationReason = "INTENT_VERSION_CHANGED";
    else if (approval.targetIdentityDigest !== intent.targetIdentityDigest)
      invalidationReason = "TARGET_CHANGED";
    else if (
      !boundResource ||
      boundResource.type !== intent.resourceType ||
      boundResource.id !== intent.resourceId ||
      boundResource.version !== intent.resourceVersion
    )
      invalidationReason = "BOUND_RESOURCE_CHANGED";
    else if (approval.boundAccountConstraint !== intent.accountIdentityDigest)
      invalidationReason = "BOUND_ACCOUNT_CHANGED";
    else if (requiresLivePreflight && !preflight)
      invalidationReason = "LIVE_PREFLIGHT_MISSING";
    else if (
      requiresLivePreflight &&
      preflight.resourceVersion !== intent.resourceVersion
    )
      invalidationReason = "RESOURCE_CHANGED";
    else if (
      requiresLivePreflight &&
      preflight.targetIdentityDigest !== intent.targetIdentityDigest
    )
      invalidationReason = "LIVE_TARGET_CHANGED";
    else if (
      requiresLivePreflight &&
      preflight.accountIdentityDigest !== intent.accountIdentityDigest
    )
      invalidationReason = "ACCOUNT_CHANGED";
    else if (isHardForbidden(intent.capabilityKey))
      invalidationReason = "HARD_FORBIDDEN";
    else if (!capability || capability.version !== intent.capabilityVersion)
      invalidationReason = "CAPABILITY_VERSION_CHANGED";
    else if (
      approval.policyDecision.outcome !== POLICY_OUTCOMES.REQUIRE_APPROVAL
    )
      invalidationReason = "POLICY_CHANGED";

    if (intent.agentId && !invalidationReason) {
      const grant = await tx.yusuf_agent_capabilities.findUnique({
        where: {
          agentId_capabilityKey: {
            agentId: intent.agentId,
            capabilityKey: intent.capabilityKey,
          },
        },
      });
      if (
        !grant ||
        !grant.enabled ||
        grant.capabilityVersion !== intent.capabilityVersion
      )
        invalidationReason = "AGENT_GRANT_CHANGED";
    }

    if (intent.taskId && !invalidationReason) {
      const task = await tx.yusuf_tasks.findUnique({
        where: { id: intent.taskId },
      });
      if (task?.projectId) {
        const override = await tx.yusuf_project_policy_overrides.findUnique({
          where: {
            projectId_capabilityKey: {
              projectId: task.projectId,
              capabilityKey: intent.capabilityKey,
            },
          },
        });
        if (
          override?.enabled &&
          [POLICY_OUTCOMES.DENY, POLICY_OUTCOMES.FORBIDDEN].includes(
            override.effect
          )
        )
          invalidationReason = "PROJECT_POLICY_CHANGED";
      }
    }

    if (invalidationReason) {
      await this.invalidateInTransaction(tx, approval, invalidationReason, {
        principal: { type: PRINCIPAL_TYPES.SYSTEM, id: "approval-service" },
        requestId: context.requestId || approval.requestId,
      });
      return { valid: false, reason: invalidationReason };
    }

    if (
      [RISK_LEVELS.L3, RISK_LEVELS.L4].includes(approval.requiredRiskLevel) &&
      (await this.securitySettings.externalMutationsDisabled(tx))
    ) {
      await this.audit.appendInTransaction(tx, {
        eventType: "execution.blocked",
        principal: { type: PRINCIPAL_TYPES.SYSTEM, id: "approval-service" },
        intentRef: intent.uuid,
        approvalRef: approval.uuid,
        outcome: ErrorCodes.MUTATIONS_DISABLED,
        metadata: { approvalPreserved: true },
        requestId: context.requestId || approval.requestId,
      });
      return { valid: false, blocked: true, reason: "MUTATIONS_DISABLED" };
    }
    return { valid: true };
  }

  async consumeInTransaction(tx, approval, context = {}) {
    const validation = await this.validateForConsumption(tx, approval, context);
    if (!validation.valid) return validation;
    const consumed = await tx.yusuf_approval_requests.updateMany({
      where: {
        id: approval.id,
        status: APPROVAL_STATUSES.APPROVED,
        version: approval.version,
        payloadHash: approval.intent.payloadHash,
      },
      data: {
        status: APPROVAL_STATUSES.CONSUMED,
        consumedAt: new Date(),
        version: { increment: 1 },
      },
    });
    if (consumed.count !== 1)
      throw new YusufOSError(
        ErrorCodes.IDEMPOTENCY_CONFLICT,
        "Approval was already consumed or changed concurrently.",
        { status: 409 }
      );
    return { valid: true, consumed: true };
  }
}

module.exports = { ApprovalService };
