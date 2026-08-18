const prisma = require("../../../utils/prisma");
const { CompletionPolicy } = require("../orchestration/CompletionPolicy");
const { getCapability } = require("../capabilities/registry");
const { redactString } = require("../security/redaction");
const { YusufOSError, ErrorCodes } = require("../errors/YusufOSError");

/**
 * Gate G drilldown projections: task, run, and approval detail addressed by
 * the **public uuid**.
 *
 * Why these exist (contract gap found while building the frontend, recorded in
 * `docs/yusuf-os/memory/KNOWN_RISKS.md`): the Gate F dashboard identifies every
 * task, run, approval and intent by uuid, but the pre-existing detail routes
 * (`GET /tasks/:id`, `/runs/:id`, `/approvals/:id`) only accept the internal
 * numeric primary key. A client could therefore see an entity on the dashboard
 * and had no addressable way to open it. Rather than reshape the Gate F
 * contract, these are additive uuid-addressed projections; the numeric routes
 * are unchanged.
 *
 * They are also *projections*, not row dumps. Raw rows carry canonical payload
 * and target JSON, principal identifiers, and Agent-authored prose. Everything
 * emitted here is either a server-owned enum, a structured field, or text that
 * has been passed through `redactString` and length-clamped, matching how
 * `DashboardProjection` already treats `targetSummary` and handoff reasons.
 */

const MAX_PROSE = 2000;
const MAX_SUMMARY = 300;

function text(value, max = MAX_SUMMARY) {
  if (value === null || value === undefined) return null;
  return redactString(String(value)).slice(0, max);
}

function iso(value) {
  return value ? new Date(value).toISOString() : null;
}

function parseJson(raw, fallback) {
  try {
    const parsed = JSON.parse(raw ?? "null");
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function notFound(what) {
  return new YusufOSError(ErrorCodes.NOT_FOUND, `${what} not found.`, {
    status: 404,
  });
}

class DetailProjections {
  constructor(db = prisma) {
    this.db = db;
    this.completion = new CompletionPolicy(db);
  }

  /**
   * The Agent roster the constellation renders: identity, mission, lifecycle
   * status and how many capabilities the Agent actually holds.
   *
   * `GET /agents` returns whole rows including the multi-kilobyte system
   * `instructions` prose. The Command Center must not build operator state out
   * of Agent prose (`FRONTEND_VISION.md`), and does not need it, so this emits
   * structured identity only.
   */
  async roster() {
    const agents = await this.db.yusuf_agents.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        capabilityGrants: {
          where: { enabled: true },
          select: { capabilityKey: true },
        },
      },
    });
    return {
      agents: agents.map((agent) => ({
        agentId: agent.key,
        name: text(agent.name, 200),
        mission: text(agent.mission, 500),
        lifecycleStatus: agent.status,
        capabilityCount: agent.capabilityGrants.length,
        // A zero-capability Agent is a real, meaningful state (the Chief of
        // Staff holds none by design) — not a loading artefact.
        capabilityKeys: agent.capabilityGrants.map((g) => g.capabilityKey),
        maxConcurrentRuns: agent.maxConcurrentRuns,
        createdAt: iso(agent.createdAt),
      })),
    };
  }

  /**
   * Task drilldown: objective, owner, dependencies, handoff edges, review
   * history, approval pressure, and the deterministic completion assessment.
   * This is the cross-task generalization of `ChiefOfStaff.taskState()`.
   */
  async task(taskUuid) {
    const task = await this.db.yusuf_tasks.findUnique({
      where: { uuid: String(taskUuid) },
      include: {
        assignedAgent: { select: { key: true, name: true } },
        project: { select: { uuid: true, key: true, name: true } },
        parentTask: { select: { uuid: true, title: true } },
      },
    });
    if (!task) throw notFound("Task");

    const [runs, handoffs, verdicts, dependencies, approvals, evidence] =
      await Promise.all([
        this.db.yusuf_agent_runs.findMany({
          where: { taskId: task.id },
          include: { agent: { select: { key: true, name: true } } },
          orderBy: { createdAt: "asc" },
        }),
        this.db.yusuf_handoffs.findMany({
          where: { taskId: task.id },
          include: {
            fromAgent: { select: { key: true } },
            toAgent: { select: { key: true } },
          },
          orderBy: { createdAt: "asc" },
        }),
        this.db.yusuf_review_verdicts.findMany({
          where: { taskId: task.id },
          include: {
            reviewerAgent: { select: { key: true } },
            reviewRun: { select: { uuid: true } },
            targetRun: { select: { uuid: true } },
          },
          orderBy: { createdAt: "asc" },
        }),
        this.db.yusuf_task_dependencies.findMany({
          where: { taskId: task.id },
          include: {
            dependsOnTask: {
              select: { uuid: true, title: true, status: true },
            },
          },
        }),
        this.db.yusuf_approval_requests.findMany({
          where: { status: "PENDING", intent: { taskId: task.id } },
          include: { intent: { select: { uuid: true, capabilityKey: true } } },
          orderBy: { requestedAt: "asc" },
        }),
        this.db.yusuf_run_evidence.findMany({
          where: { taskId: task.id },
          orderBy: { createdAt: "asc" },
        }),
      ]);

    const completion = await this.completion.evaluate(task.id);

    return {
      task: {
        taskId: task.uuid,
        title: text(task.title, 500),
        objective: text(task.objective, MAX_PROSE),
        status: task.status,
        priority: task.priority,
        taskKind: task.taskKind,
        blockingReason: text(task.blockedReason) || null,
        ownerAgentId: task.assignedAgent?.key || null,
        ownerAgentName: text(task.assignedAgent?.name) || null,
        project: task.project
          ? {
              projectId: task.project.uuid,
              key: task.project.key,
              name: text(task.project.name),
            }
          : null,
        parentTaskId: task.parentTask?.uuid || null,
        completionGates: parseJson(task.completionGates, []),
        createdAt: iso(task.createdAt),
        updatedAt: iso(task.updatedAt),
        deadline: iso(task.deadline),
      },
      runs: runs.map((run) => ({
        runId: run.uuid,
        agentId: run.agent?.key || null,
        runKind: run.runKind,
        status: run.status,
        failureKind: run.failureKind || null,
        blockingReason: text(run.blockedReason) || null,
        startedAt: iso(run.startedAt),
        completedAt: iso(run.completedAt),
        createdAt: iso(run.createdAt),
      })),
      handoffs: handoffs.map((handoff) => ({
        handoffId: handoff.uuid,
        fromAgentId: handoff.fromAgent.key,
        toAgentId: handoff.toAgent.key,
        status: handoff.status,
        gate: text(handoff.reason, 200),
        createdAt: iso(handoff.createdAt),
        acceptedAt: iso(handoff.acceptedAt),
        completedAt: iso(handoff.completedAt),
      })),
      reviewHistory: verdicts.map((verdict) => ({
        verdictId: verdict.uuid,
        verdict: verdict.verdict,
        reviewerAgentId: verdict.reviewerAgent.key,
        reviewRunId: verdict.reviewRun?.uuid || null,
        targetRunId: verdict.targetRun?.uuid || null,
        summary: text(verdict.summary, MAX_PROSE),
        findingCount: parseJson(verdict.findings, []).length,
        createdAt: iso(verdict.createdAt),
      })),
      dependencies: dependencies.map((dependency) => ({
        taskId: dependency.dependsOnTask.uuid,
        title: text(dependency.dependsOnTask.title, 500),
        status: dependency.dependsOnTask.status,
        relation: dependency.relation,
      })),
      waitingApprovals: approvals.map((approval) => ({
        approvalId: approval.uuid,
        intentId: approval.intent.uuid,
        capabilityKey: approval.intent.capabilityKey,
        riskLevel: approval.requiredRiskLevel,
        expiresAt: iso(approval.expiresAt),
      })),
      evidence: evidence.map((row) => ({
        evidenceId: row.uuid,
        kind: row.kind,
        status: row.status,
        summary: text(row.summary, MAX_PROSE),
        createdAt: iso(row.createdAt),
      })),
      completion,
    };
  }

  /**
   * Run drilldown: the explainability surface. Policy decisions, capability
   * requests, approvals, execution receipts, verification outcome, evidence,
   * handoffs and review verdict for one run — structured, never a raw object
   * dump, and with no canonical payload or principal identity emitted.
   */
  async run(runUuid) {
    const run = await this.db.yusuf_agent_runs.findUnique({
      where: { uuid: String(runUuid) },
      include: {
        agent: { select: { key: true, name: true } },
        task: {
          select: {
            uuid: true,
            title: true,
            status: true,
            project: { select: { uuid: true, key: true, name: true } },
          },
        },
      },
    });
    if (!run) throw notFound("Run");

    const [intents, evidence, verdict, handoffsFrom, handoffsTo] =
      await Promise.all([
        this.db.yusuf_action_intents.findMany({
          where: { runId: run.id },
          include: {
            policyDecisions: { orderBy: { decidedAt: "asc" } },
            approval: true,
            receipt: true,
          },
          orderBy: { createdAt: "asc" },
        }),
        this.db.yusuf_run_evidence.findMany({
          where: { runId: run.id },
          orderBy: { createdAt: "asc" },
        }),
        this.db.yusuf_review_verdicts.findFirst({
          where: { reviewRunId: run.id },
          include: { reviewerAgent: { select: { key: true } } },
        }),
        this.db.yusuf_handoffs.findMany({
          where: { fromRunId: run.id },
          include: { toAgent: { select: { key: true } } },
        }),
        this.db.yusuf_handoffs.findMany({
          where: { toRunId: run.id },
          include: { fromAgent: { select: { key: true } } },
        }),
      ]);

    return {
      run: {
        runId: run.uuid,
        agentId: run.agent?.key || null,
        agentName: text(run.agent?.name) || null,
        runKind: run.runKind,
        status: run.status,
        failureKind: run.failureKind || null,
        blockingReason: text(run.blockedReason) || null,
        // `modelRef` is a provider/model identifier, never a credential.
        modelRef: text(run.modelRef, 200) || null,
        tokenUsage: parseJson(run.tokenUsage, null),
        estimatedCostMicros: run.estimatedCostMicros ?? null,
        startedAt: iso(run.startedAt),
        completedAt: iso(run.completedAt),
        createdAt: iso(run.createdAt),
        updatedAt: iso(run.updatedAt),
      },
      task: run.task
        ? {
            taskId: run.task.uuid,
            title: text(run.task.title, 500),
            status: run.task.status,
            project: run.task.project
              ? {
                  projectId: run.task.project.uuid,
                  key: run.task.project.key,
                  name: text(run.task.project.name),
                }
              : null,
          }
        : null,
      intents: intents.map((intent) => {
        const capability = getCapability(intent.capabilityKey);
        return {
          intentId: intent.uuid,
          capabilityKey: intent.capabilityKey,
          capabilityDescription: text(capability?.description) || null,
          resourceType: intent.resourceType,
          resourceId: text(intent.resourceId),
          status: intent.status,
          createdAt: iso(intent.createdAt),
          policyDecisions: intent.policyDecisions.map((decision) => ({
            decisionId: decision.uuid,
            outcome: decision.outcome,
            riskLevel: decision.riskLevel,
            reasonCode: decision.reasonCode,
            explanation: text(decision.explanation, MAX_PROSE),
            decidedAt: iso(decision.decidedAt),
          })),
          approval: intent.approval
            ? {
                approvalId: intent.approval.uuid,
                status: intent.approval.status,
                riskLevel: intent.approval.requiredRiskLevel,
                requestedAt: iso(intent.approval.requestedAt),
                decidedAt: iso(intent.approval.decidedAt),
                expiresAt: iso(intent.approval.expiresAt),
                consumedAt: iso(intent.approval.consumedAt),
                invalidationReason:
                  text(intent.approval.invalidationReason) || null,
              }
            : null,
          receipt: intent.receipt
            ? {
                receiptId: intent.receipt.uuid,
                adapterId: intent.receipt.adapterId,
                adapterKind: intent.receipt.adapterKind,
                outcome: intent.receipt.outcome,
                verificationStatus: intent.receipt.verificationStatus,
                externalReference:
                  text(intent.receipt.externalReference, 200) || null,
                safeAccountIdentity:
                  text(intent.receipt.safeAccountIdentity, 200) || null,
                startedAt: iso(intent.receipt.startedAt),
                completedAt: iso(intent.receipt.completedAt),
              }
            : null,
        };
      }),
      evidence: evidence.map((row) => ({
        evidenceId: row.uuid,
        kind: row.kind,
        status: row.status,
        summary: text(row.summary, MAX_PROSE),
        createdAt: iso(row.createdAt),
      })),
      reviewVerdict: verdict
        ? {
            verdictId: verdict.uuid,
            verdict: verdict.verdict,
            reviewerAgentId: verdict.reviewerAgent.key,
            summary: text(verdict.summary, MAX_PROSE),
            findingCount: parseJson(verdict.findings, []).length,
            createdAt: iso(verdict.createdAt),
          }
        : null,
      handoffs: [
        ...handoffsFrom.map((handoff) => ({
          handoffId: handoff.uuid,
          direction: "OUTGOING",
          counterpartAgentId: handoff.toAgent.key,
          status: handoff.status,
          gate: text(handoff.reason, 200),
          createdAt: iso(handoff.createdAt),
        })),
        ...handoffsTo.map((handoff) => ({
          handoffId: handoff.uuid,
          direction: "INCOMING",
          counterpartAgentId: handoff.fromAgent.key,
          status: handoff.status,
          gate: text(handoff.reason, 200),
          createdAt: iso(handoff.createdAt),
        })),
      ],
    };
  }

  /**
   * Approval review projection — everything §8 of the Gate B API contract says
   * the review surface must display, and nothing more.
   *
   * `decision` carries the exact optimistic-concurrency values the existing
   * `POST /approvals/:id/decisions` route requires. The UI echoes them back;
   * it never invents or edits them, and if the intent has drifted the server
   * still rejects the decision.
   */
  async approvalReview(approvalUuid) {
    const approval = await this.db.yusuf_approval_requests.findUnique({
      where: { uuid: String(approvalUuid) },
      include: {
        policyDecision: true,
        intent: {
          include: {
            agent: { select: { key: true, name: true } },
            run: { select: { uuid: true, runKind: true, status: true } },
            task: {
              select: {
                uuid: true,
                title: true,
                status: true,
                project: { select: { uuid: true, key: true, name: true } },
              },
            },
            receipt: {
              select: { outcome: true, verificationStatus: true, uuid: true },
            },
          },
        },
      },
    });
    if (!approval) throw notFound("Approval");

    const intent = approval.intent;
    const capability = getCapability(intent.capabilityKey);
    const reviewVerdict = intent.task
      ? await this.db.yusuf_review_verdicts.findFirst({
          where: { task: { uuid: intent.task.uuid } },
          orderBy: { createdAt: "desc" },
          select: { verdict: true, createdAt: true },
        })
      : null;

    return {
      approval: {
        approvalId: approval.uuid,
        status: approval.status,
        riskLevel: approval.requiredRiskLevel,
        requestedAt: iso(approval.requestedAt),
        expiresAt: iso(approval.expiresAt),
        decidedAt: iso(approval.decidedAt),
        consumedAt: iso(approval.consumedAt),
        invalidatedAt: iso(approval.invalidatedAt),
        invalidationReason: text(approval.invalidationReason) || null,
        decisionNote: text(approval.decisionNote, MAX_PROSE) || null,
        // One-use semantics are a property of the approval, not a UI caption.
        singleUse: true,
      },
      requestedBy: {
        // Principal *type* only. The identifier is a security-relevant value
        // that the operator surface has no need to display.
        principalType: intent.requestedByPrincipalType,
        agentId: intent.agent?.key || null,
        agentName: text(intent.agent?.name) || null,
      },
      context: {
        taskId: intent.task?.uuid || null,
        taskTitle: text(intent.task?.title, 500) || null,
        taskStatus: intent.task?.status || null,
        runId: intent.run?.uuid || null,
        runKind: intent.run?.runKind || null,
        project: intent.task?.project
          ? {
              projectId: intent.task.project.uuid,
              key: intent.task.project.key,
              name: text(intent.task.project.name),
            }
          : null,
        latestReviewVerdict: reviewVerdict?.verdict || null,
        latestReviewAt: iso(reviewVerdict?.createdAt),
      },
      capability: {
        key: intent.capabilityKey,
        version: intent.capabilityVersion,
        description: text(capability?.description, 500) || null,
        domain: capability?.domain || null,
        mutation: capability?.mutation ?? null,
      },
      target: {
        resourceType: intent.resourceType,
        resourceId: text(intent.resourceId, 500),
        resourceVersion: text(intent.resourceVersion, 200) || null,
        environment: intent.environment,
        // Digests, not the underlying identities: enough to see that the bound
        // target is stable, without republishing the target itself.
        targetIdentityDigest: intent.targetIdentityDigest,
        accountIdentityDigest: intent.accountIdentityDigest || null,
      },
      policy: {
        outcome: approval.policyDecision.outcome,
        riskLevel: approval.policyDecision.riskLevel,
        reasonCode: approval.policyDecision.reasonCode,
        explanation: text(approval.policyDecision.explanation, MAX_PROSE),
        matchedRules: parseJson(approval.policyDecision.matchedRules, []),
        decidedAt: iso(approval.policyDecision.decidedAt),
      },
      execution: {
        intentStatus: intent.status,
        receiptOutcome: intent.receipt?.outcome || null,
        verificationStatus: intent.receipt?.verificationStatus || null,
      },
      decision: {
        // The numeric key the existing decision route addresses. Exposed so the
        // UI can call the *existing* mutation endpoint rather than a new one.
        approvalRouteId: approval.id,
        expectedPayloadHash: approval.payloadHash,
        expectedIntentVersion: approval.boundIntentVersion,
        expectedApprovalVersion: approval.version,
        decidable: approval.status === "PENDING",
      },
    };
  }
}

module.exports = { DetailProjections };
