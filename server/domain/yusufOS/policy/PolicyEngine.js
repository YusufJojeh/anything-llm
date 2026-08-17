const { randomUUID } = require("crypto");
const prisma = require("../../../utils/prisma");
const {
  POLICY_OUTCOMES,
  RISK_LEVELS,
  INTENT_STATUSES,
  PRINCIPAL_TYPES,
} = require("../constants");
const { getCapability, isHardForbidden } = require("../capabilities/registry");
const { canonicalHash } = require("../security/canonicalJson");
const { AuditService } = require("../audit/AuditService");
const { SecuritySettings } = require("../security/SecuritySettings");
const { YusufOSError, ErrorCodes } = require("../errors/YusufOSError");

const RISK_ORDER = Object.freeze({ L0: 0, L1: 1, L2: 2, L3: 3, L4: 4 });
const OUTCOME_ORDER = Object.freeze({
  ALLOW: 0,
  REQUIRE_APPROVAL: 1,
  DENY: 2,
  FORBIDDEN: 3,
});

function stricterRisk(left, right) {
  return RISK_ORDER[left] >= RISK_ORDER[right] ? left : right;
}

function stricterOutcome(left, right) {
  return OUTCOME_ORDER[left] >= OUTCOME_ORDER[right] ? left : right;
}

class PolicyEngine {
  constructor(db = prisma, { approvalTtlMs = 30 * 60 * 1000 } = {}) {
    this.db = db;
    this.approvalTtlMs = approvalTtlMs;
    this.audit = new AuditService(db);
    this.securitySettings = new SecuritySettings(db);
  }

  async evaluate(intentId) {
    return this.db.$transaction(async (tx) => {
      const intent = await tx.yusuf_action_intents.findUnique({
        where: { id: Number(intentId) },
        include: { task: true },
      });
      if (!intent)
        throw new YusufOSError(ErrorCodes.NOT_FOUND, "Intent not found.", {
          status: 404,
        });
      if (intent.status !== INTENT_STATUSES.INTENT_CREATED) {
        const decision = intent.activePolicyDecisionId
          ? await tx.yusuf_policy_decisions.findUnique({
              where: { id: intent.activePolicyDecisionId },
            })
          : null;
        if (decision) {
          const approval = await tx.yusuf_approval_requests.findUnique({
            where: { intentId: intent.id },
          });
          return { decision, approval, status: intent.status };
        }
        throw new YusufOSError(
          ErrorCodes.INVALID_STATE_TRANSITION,
          "Only a newly created intent may be evaluated.",
          {
            status: 409,
            details: { status: intent.status, version: intent.version },
          }
        );
      }

      const capability = getCapability(intent.capabilityKey);
      const matchedRules = [];
      let riskLevel = capability?.defaultRisk || RISK_LEVELS.L4;
      let outcome = capability?.defaultOutcome || POLICY_OUTCOMES.DENY;
      let reasonCode = "CAPABILITY_DEFAULT";
      let explanation = "The code-owned capability default was applied.";

      if (isHardForbidden(intent.capabilityKey)) {
        outcome = POLICY_OUTCOMES.FORBIDDEN;
        riskLevel = RISK_LEVELS.L4;
        reasonCode = "HARD_FORBIDDEN";
        explanation =
          "A code-owned hard security invariant forbids this action.";
        matchedRules.push({
          id: `hard:${intent.capabilityKey}`,
          version: 1,
          effect: outcome,
        });
      } else if (!capability) {
        outcome = POLICY_OUTCOMES.DENY;
        reasonCode = "CAPABILITY_UNREGISTERED";
        explanation =
          "The capability is not present in the code-owned registry.";
        matchedRules.push({
          id: "system:registered-capability",
          version: 1,
          effect: outcome,
        });
      } else {
        matchedRules.push({
          id: `capability:${capability.key}`,
          version: capability.version,
          effect: outcome,
        });

        if (capability.hardFlags.includes("GATE_D_DEFERRED")) {
          outcome = POLICY_OUTCOMES.DENY;
          reasonCode = "CAPABILITY_DEFERRED";
          explanation =
            "This capability is registered for future use but disabled in Gate C.";
          matchedRules.push({
            id: "system:gate-c-scope",
            version: 1,
            effect: outcome,
          });
        }

        if (await this.securitySettings.externalMutationsDisabled(tx)) {
          if (RISK_ORDER[riskLevel] >= RISK_ORDER[RISK_LEVELS.L3]) {
            outcome = POLICY_OUTCOMES.DENY;
            reasonCode = "MUTATIONS_DISABLED";
            explanation = "The global external mutation kill switch is active.";
            matchedRules.push({
              id: "system:external-mutation-kill-switch",
              version: 1,
              effect: outcome,
            });
          }
        }

        let grant = null;
        if (intent.agentId) {
          grant = await tx.yusuf_agent_capabilities.findUnique({
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
            grant.capabilityVersion !== capability.version
          ) {
            outcome = stricterOutcome(outcome, POLICY_OUTCOMES.DENY);
            reasonCode = "AGENT_CAPABILITY_NOT_GRANTED";
            explanation =
              "The owning Agent lacks a current enabled capability grant.";
            matchedRules.push({
              id: "agent:capability-grant",
              version: grant?.version || 0,
              effect: POLICY_OUTCOMES.DENY,
            });
          } else {
            matchedRules.push({
              id: `grant:${grant.id}`,
              version: grant.version,
              effect: "REQUEST_ALLOWED",
            });
          }
        } else if (intent.requestedByPrincipalType === PRINCIPAL_TYPES.AGENT) {
          outcome = stricterOutcome(outcome, POLICY_OUTCOMES.DENY);
          reasonCode = "AGENT_ID_REQUIRED";
          explanation =
            "An Agent principal must be bound to an AgentDefinition.";
          matchedRules.push({
            id: "agent:identity-binding",
            version: 1,
            effect: POLICY_OUTCOMES.DENY,
          });
        }

        let projectOverride = null;
        if (intent.task.projectId) {
          projectOverride = await tx.yusuf_project_policy_overrides.findUnique({
            where: {
              projectId_capabilityKey: {
                projectId: intent.task.projectId,
                capabilityKey: intent.capabilityKey,
              },
            },
          });
          if (projectOverride?.enabled) {
            if (projectOverride.riskFloor)
              riskLevel = stricterRisk(riskLevel, projectOverride.riskFloor);
            outcome = stricterOutcome(outcome, projectOverride.effect);
            reasonCode = "PROJECT_POLICY_RESTRICTION";
            explanation = "A project policy increased the action restriction.";
            matchedRules.push({
              id: `project:${projectOverride.id}`,
              version: projectOverride.version,
              effect: projectOverride.effect,
            });
          }
        }

        if (
          outcome === POLICY_OUTCOMES.ALLOW &&
          RISK_ORDER[riskLevel] >= RISK_ORDER[RISK_LEVELS.L3]
        ) {
          outcome = POLICY_OUTCOMES.REQUIRE_APPROVAL;
          reasonCode = "RISK_REQUIRES_APPROVAL";
          explanation = "The policy-owned risk level requires Yusuf approval.";
          matchedRules.push({
            id: "system:risk-approval",
            version: 1,
            effect: outcome,
          });
        }
      }

      const policyBundleDigest = canonicalHash({
        capability: capability
          ? { key: capability.key, version: capability.version }
          : { key: intent.capabilityKey, version: intent.capabilityVersion },
        matchedRules,
      });
      const evaluated = await tx.yusuf_action_intents.updateMany({
        where: {
          id: intent.id,
          status: INTENT_STATUSES.INTENT_CREATED,
          version: intent.version,
        },
        data: {
          status: INTENT_STATUSES.POLICY_EVALUATED,
          version: { increment: 1 },
        },
      });
      if (evaluated.count !== 1)
        throw new YusufOSError(
          ErrorCodes.INTENT_VERSION_CONFLICT,
          "Intent changed during policy evaluation.",
          { status: 409 }
        );

      const decision = await tx.yusuf_policy_decisions.create({
        data: {
          uuid: randomUUID(),
          intentId: intent.id,
          decisionVersion: 1,
          outcome,
          riskLevel,
          reasonCode,
          explanation,
          matchedRules: JSON.stringify(matchedRules),
          evaluatedAgentPolicyRef: intent.agentId
            ? JSON.stringify({ agentId: intent.agentId })
            : null,
          evaluatedProjectPolicyRef: intent.task.projectId
            ? JSON.stringify({ projectId: intent.task.projectId })
            : null,
          evaluatedResourceVersions: JSON.stringify([
            {
              type: intent.resourceType,
              id: intent.resourceId,
              version: intent.resourceVersion,
            },
          ]),
          evaluatedAccountConstraint: intent.accountIdentityDigest,
          policyBundleDigest,
          decidedByPrincipalType: PRINCIPAL_TYPES.SYSTEM,
          decidedByPrincipalId: "yusuf-policy-engine",
          requestId: intent.requestId,
        },
      });

      const finalStatus = {
        [POLICY_OUTCOMES.ALLOW]: INTENT_STATUSES.AUTHORIZED,
        [POLICY_OUTCOMES.REQUIRE_APPROVAL]: INTENT_STATUSES.WAITING_APPROVAL,
        [POLICY_OUTCOMES.DENY]: INTENT_STATUSES.POLICY_DENIED,
        [POLICY_OUTCOMES.FORBIDDEN]: INTENT_STATUSES.FORBIDDEN,
      }[outcome];
      const finalized = await tx.yusuf_action_intents.updateMany({
        where: {
          id: intent.id,
          status: INTENT_STATUSES.POLICY_EVALUATED,
          version: intent.version + 1,
        },
        data: {
          status: finalStatus,
          activePolicyDecisionId: decision.id,
          version: { increment: 1 },
        },
      });
      if (finalized.count !== 1)
        throw new YusufOSError(
          ErrorCodes.INTENT_VERSION_CONFLICT,
          "Intent changed while applying the policy decision.",
          { status: 409 }
        );

      let approval = null;
      if (outcome === POLICY_OUTCOMES.REQUIRE_APPROVAL) {
        approval = await tx.yusuf_approval_requests.create({
          data: {
            uuid: randomUUID(),
            intentId: intent.id,
            policyDecisionId: decision.id,
            payloadHash: intent.payloadHash,
            boundIntentVersion: intent.version + 2,
            targetIdentityDigest: intent.targetIdentityDigest,
            boundResourceVersions: JSON.stringify([
              {
                type: intent.resourceType,
                id: intent.resourceId,
                version: intent.resourceVersion,
              },
            ]),
            boundAccountConstraint: intent.accountIdentityDigest,
            requiredRiskLevel: riskLevel,
            expiresAt: new Date(Date.now() + this.approvalTtlMs),
            requestId: intent.requestId,
          },
        });
        await tx.yusuf_agent_runs.updateMany({
          where: { id: intent.runId, status: "RUNNING" },
          data: {
            status: "WAITING_APPROVAL",
            version: { increment: 1 },
          },
        });
      }

      await this.audit.appendInTransaction(tx, {
        eventType: "policy.decision",
        principal: { type: PRINCIPAL_TYPES.SYSTEM, id: "yusuf-policy-engine" },
        taskRef: intent.taskId,
        runRef: intent.runId,
        intentRef: intent.uuid,
        approvalRef: approval?.uuid,
        resource: { type: intent.resourceType, id: intent.resourceId },
        outcome,
        metadata: {
          riskLevel,
          reasonCode,
          matchedRules,
          policyBundleDigest,
          approvalCreated: Boolean(approval),
        },
        requestId: intent.requestId,
      });

      return { decision, approval, status: finalStatus };
    });
  }
}

module.exports = {
  PolicyEngine,
  RISK_ORDER,
  OUTCOME_ORDER,
  stricterRisk,
  stricterOutcome,
};
