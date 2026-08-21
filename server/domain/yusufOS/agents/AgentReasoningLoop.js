const { randomUUID } = require("crypto");
const prisma = require("../../../utils/prisma");
const {
  RUN_STATUSES,
  RUN_KINDS,
  RUN_FAILURE_KINDS,
  PRINCIPAL_TYPES,
} = require("../constants");
const { getCapability } = require("../capabilities/registry");
const { canonicalHash } = require("../security/canonicalJson");
const { redactForPersistence } = require("../security/redaction");
const { YusufOSError, ErrorCodes } = require("../errors/YusufOSError");
const { getAgentDefinition } = require("./definitions");
const { AgentDecision, AGENT_DECISION_TYPES } = require("./contracts");
const { PromptAssembler } = require("./PromptAssembler");
const { RoutedModelClient, promptDigest } = require("./ModelClient");
const { AgentRunCoordinator } = require("./AgentRunCoordinator");
const { HandoffService } = require("../handoffs/HandoffService");
const { getAgentByKey } = require("./AgentRegistry");
const { AuditService } = require("../audit/AuditService");
const { resolveAgentModelPolicy } = require("../models/AgentModelPolicy");
const { ReviewService } = require("../review/ReviewService");
const toolBinding = require("./toolBinding");

const DEFAULT_LIMITS = Object.freeze({
  maxReasoningSteps: 12,
  maxToolCalls: 8,
  maxHandoffs: 8,
  maxRetryCount: 2,
  maxWallClockMs: 120000,
  maxModelTokens: 32000,
  maxKnownCostMicros: 1000000,
});

const REQUIRED_REASONING_CAPABILITIES = Object.freeze([
  "text",
  "structured_output",
  "tool_reasoning",
]);

function limitsWithDefaults(overrides = {}) {
  const result = { ...DEFAULT_LIMITS };
  const strictlyPositive = new Set([
    "maxReasoningSteps",
    "maxWallClockMs",
    "maxModelTokens",
    "maxKnownCostMicros",
  ]);
  for (const [key, value] of Object.entries(overrides)) {
    if (
      !(key in result) ||
      !Number.isInteger(value) ||
      value < 0 ||
      (strictlyPositive.has(key) && value === 0)
    )
      throw new YusufOSError(
        ErrorCodes.VALIDATION_ERROR,
        `Invalid reasoning limit: ${key}.`,
        { status: 422 }
      );
    result[key] = value;
  }
  return result;
}

function boundedResult(value) {
  const redacted = redactForPersistence(value);
  const serialized = JSON.stringify(redacted);
  return serialized.length <= 12000
    ? redacted
    : { truncated: true, preview: serialized.slice(0, 12000) };
}

function parseReasoningState(raw) {
  let value = {};
  try {
    value = raw ? JSON.parse(raw) : {};
  } catch {
    value = {};
  }
  const count = (field) =>
    Number.isSafeInteger(value[field]) && value[field] >= 0 ? value[field] : 0;
  return {
    startedAtMs:
      Number.isSafeInteger(value.startedAtMs) && value.startedAtMs > 0
        ? value.startedAtMs
        : 0,
    steps: count("steps"),
    toolCalls: count("toolCalls"),
    handoffs: count("handoffs"),
    retries: count("retries"),
    tokens: count("tokens"),
    knownCostMicros: count("knownCostMicros"),
    fingerprints: Array.isArray(value.fingerprints)
      ? value.fingerprints.filter(
          (item) => typeof item === "string" && /^[a-f0-9]{64}$/.test(item)
        )
      : [],
  };
}

function withAbort(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted)
    return Promise.reject(
      new YusufOSError(ErrorCodes.CONFLICT, "Model completion was cancelled.", {
        status: 409,
      })
    );
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(
        new YusufOSError(
          ErrorCodes.CONFLICT,
          "Model completion was cancelled.",
          { status: 409 }
        )
      );
    };
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve(promise).then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      }
    );
  });
}

class AgentReasoningLoop {
  constructor({
    db = prisma,
    modelClient,
    runCoordinator,
    promptAssembler,
    buildToolset = toolBinding.buildAgentToolset,
    invokeCapability = toolBinding.invokeCapability,
    handoffService,
    reviewService,
    clock = () => Date.now(),
  } = {}) {
    this.db = db;
    this.modelClient = modelClient || new RoutedModelClient();
    this.runs = runCoordinator || new AgentRunCoordinator(db);
    this.prompts = promptAssembler || new PromptAssembler();
    this.buildToolset = buildToolset;
    this.invokeCapability = invokeCapability;
    this.handoffs = handoffService || new HandoffService(db);
    this.reviews = reviewService || new ReviewService(db);
    this.audit = new AuditService(db);
    this.clock = clock;
  }

  async #loadRun(runId) {
    const run = await this.db.yusuf_agent_runs.findUnique({
      where: { id: Number(runId) },
      include: {
        agent: true,
        task: { include: { project: true, evidence: true } },
      },
    });
    if (!run)
      throw new YusufOSError(ErrorCodes.NOT_FOUND, "Run not found.", {
        status: 404,
      });
    return run;
  }

  async #acquireLease({ runId, leaseId, maxWallClockMs }) {
    const now = new Date();
    const acquired = await this.db.yusuf_agent_runs.updateMany({
      where: {
        id: Number(runId),
        status: RUN_STATUSES.RUNNING,
        OR: [
          { reasoningLeaseId: null },
          { reasoningLeaseExpiresAt: { lt: now } },
        ],
      },
      data: {
        reasoningLeaseId: leaseId,
        reasoningLeaseExpiresAt: new Date(
          now.getTime() + maxWallClockMs + 5000
        ),
      },
    });
    if (acquired.count !== 1)
      throw new YusufOSError(
        ErrorCodes.CONFLICT,
        "This Agent run already has an active reasoning lease.",
        { status: 409, details: { reason: "REASONING_LEASE_HELD" } }
      );
  }

  async #saveReasoningState(runId, leaseId, state) {
    const saved = await this.db.yusuf_agent_runs.updateMany({
      where: {
        id: Number(runId),
        reasoningLeaseId: leaseId,
        status: RUN_STATUSES.RUNNING,
      },
      data: { reasoningState: JSON.stringify(state) },
    });
    if (saved.count !== 1)
      throw new YusufOSError(
        ErrorCodes.CONFLICT,
        "The reasoning lease or run state changed concurrently.",
        { status: 409 }
      );
  }

  async #releaseLease(runId, leaseId) {
    await this.db.yusuf_agent_runs.updateMany({
      where: { id: Number(runId), reasoningLeaseId: leaseId },
      data: { reasoningLeaseId: null, reasoningLeaseExpiresAt: null },
    });
  }

  #assertBudget({ startedAt, limits, totals, signal }) {
    if (signal?.aborted)
      throw new YusufOSError(ErrorCodes.CONFLICT, "Agent run was cancelled.", {
        status: 409,
      });
    if (this.clock() - startedAt > limits.maxWallClockMs)
      throw new YusufOSError(
        ErrorCodes.CONFLICT,
        "Agent reasoning exceeded its wall-clock budget.",
        { status: 409 }
      );
    if (totals.tokens > limits.maxModelTokens)
      throw new YusufOSError(
        ErrorCodes.CONFLICT,
        "Agent reasoning exceeded its model token budget.",
        { status: 409 }
      );
    if (totals.knownCostMicros > limits.maxKnownCostMicros)
      throw new YusufOSError(
        ErrorCodes.CONFLICT,
        "Agent reasoning exceeded its known cost budget.",
        { status: 409 }
      );
  }

  #assertCanStartCompletion(limits, totals) {
    if (totals.tokens >= limits.maxModelTokens)
      throw new YusufOSError(
        ErrorCodes.CONFLICT,
        "Agent reasoning has no model token budget remaining.",
        { status: 409 }
      );
    if (totals.knownCostMicros >= limits.maxKnownCostMicros)
      throw new YusufOSError(
        ErrorCodes.CONFLICT,
        "Agent reasoning has no known cost budget remaining.",
        { status: 409 }
      );
  }

  async #runStatus(runId) {
    const current = await this.db.yusuf_agent_runs.findUnique({
      where: { id: Number(runId) },
      select: { status: true },
    });
    if (!current)
      throw new YusufOSError(ErrorCodes.NOT_FOUND, "Agent run was not found.", {
        status: 404,
      });
    return current.status;
  }

  async #assertRunActive(runId) {
    const status = await this.#runStatus(runId);
    if (status !== RUN_STATUSES.RUNNING)
      throw new YusufOSError(
        ErrorCodes.INVALID_STATE_TRANSITION,
        "Agent reasoning cannot continue after the run left RUNNING.",
        { status: 409, details: { status } }
      );
  }

  async #completeModel({
    run,
    definition,
    prompt,
    messages,
    step,
    limits,
    retryState,
    signal,
    maxCompletionTokens,
    modelPolicy,
    promptTokenEstimate,
    maxKnownCostMicros,
    onRetry,
  }) {
    while (true) {
      if (signal?.aborted)
        throw new YusufOSError(
          ErrorCodes.CONFLICT,
          "Model completion was cancelled.",
          { status: 409 }
        );
      try {
        return await withAbort(
          Promise.resolve().then(() =>
            this.modelClient.complete({
              agentKey: definition.key,
              phase: "reasoning",
              context: {
                prompt,
                messages,
                runId: run.uuid,
                step,
              },
              modelPolicy,
              requiredCapabilities: [
                ...REQUIRED_REASONING_CAPABILITIES,
                {
                  capability: "context_length",
                  minimum: promptTokenEstimate + maxCompletionTokens,
                },
              ],
              maxCompletionTokens,
              signal,
              promptTokenEstimate,
              maxKnownCostMicros,
            })
          ),
          signal
        );
      } catch (error) {
        if (
          signal?.aborted ||
          error?.code === ErrorCodes.CONFLICT ||
          error?.code !== ErrorCodes.MODEL_UNAVAILABLE
        )
          throw error;
        if (retryState.count >= limits.maxRetryCount) throw error;
        retryState.count += 1;
        await onRetry(retryState.count);
      }
    }
  }

  async #createHandoff({
    run,
    targetAgentKey,
    reason,
    requestId,
    handoffCount,
  }) {
    const target = await getAgentByKey(targetAgentKey, this.db);
    if (!target)
      throw new YusufOSError(
        ErrorCodes.NOT_FOUND,
        `Agent ${targetAgentKey} is not registered.`,
        { status: 404 }
      );
    const assigned = await this.db.yusuf_tasks.updateMany({
      where: { id: run.taskId, assignedAgentId: run.agentId },
      data: { assignedAgentId: target.id },
    });
    if (assigned.count !== 1)
      throw new YusufOSError(
        ErrorCodes.CONFLICT,
        "Task ownership changed before the handoff could be reserved.",
        { status: 409 }
      );

    let handoff;
    let nextRun;
    try {
      handoff = await this.handoffs.create({
        taskId: run.taskId,
        fromAgentId: run.agentId,
        toAgentId: target.id,
        fromRunId: run.id,
        reason: "AGENT_REQUESTED_HANDOFF",
        artifacts: [{ kind: "MODEL_REASON", value: reason }],
        actingAgentId: run.agentId,
        requestId,
      });
      nextRun = await this.runs.createRun({
        taskId: run.taskId,
        agentId: target.id,
        runKind:
          targetAgentKey === "reviewer"
            ? RUN_KINDS.REVIEW
            : targetAgentKey === "chief_of_staff"
              ? RUN_KINDS.ORCHESTRATION
              : RUN_KINDS.IMPLEMENTATION,
        principal: { type: PRINCIPAL_TYPES.AGENT, id: run.agent.uuid },
        requestId,
        attempt: handoffCount + 1,
        deferStart: true,
      });
      await this.handoffs.accept({
        handoffId: handoff.id,
        acceptingAgentId: target.id,
        toRunId: nextRun.id,
        requestId,
      });
      await this.runs.activateHandoff({
        sourceRunId: run.id,
        targetRunId: nextRun.id,
        requestId,
      });
      return { handoff, nextRun };
    } catch (error) {
      await this.db.$transaction(async (tx) => {
        await tx.yusuf_tasks.updateMany({
          where: { id: run.taskId, assignedAgentId: target.id },
          data: { assignedAgentId: run.agentId },
        });
        if (handoff)
          await tx.yusuf_handoffs.updateMany({
            where: { id: handoff.id, status: { in: ["PENDING", "ACCEPTED"] } },
            data: { status: "CANCELLED", version: { increment: 1 } },
          });
        if (nextRun)
          await tx.yusuf_agent_runs.updateMany({
            where: {
              id: nextRun.id,
              status: {
                in: [RUN_STATUSES.QUEUED, RUN_STATUSES.WAITING_DEPENDENCY],
              },
            },
            data: {
              status: RUN_STATUSES.CANCELLED,
              completedAt: new Date(),
              version: { increment: 1 },
            },
          });
        await this.audit.appendInTransaction(tx, {
          eventType: "handoff.reservation_cancelled",
          principal: { type: PRINCIPAL_TYPES.SYSTEM, id: "reasoning-loop" },
          taskRef: run.taskId,
          runRef: run.id,
          outcome: "CANCELLED",
          metadata: { targetAgent: targetAgentKey },
          requestId,
        });
      });
      throw error;
    }
  }

  async #execute({
    runId,
    scopedMemory = [],
    scopedKnowledge = [],
    limits: limitOverrides = {},
    signal,
    requestId = randomUUID(),
    leaseId,
  }) {
    const limits = limitsWithDefaults(limitOverrides);
    let run = await this.#loadRun(runId);
    const definition = getAgentDefinition(run.agent?.key);
    if (!definition)
      throw new YusufOSError(
        ErrorCodes.VALIDATION_ERROR,
        "The run is not owned by a code-defined Agent.",
        { status: 422 }
      );
    if (run.status === RUN_STATUSES.QUEUED) {
      await this.runs.startRun({ runId: run.id, requestId });
      run = await this.#loadRun(run.id);
    }
    if (run.status !== RUN_STATUSES.RUNNING)
      throw new YusufOSError(
        ErrorCodes.INVALID_STATE_TRANSITION,
        "Only a queued or running run may enter the reasoning loop.",
        { status: 409, details: { status: run.status } }
      );
    if (Number(run.task.assignedAgentId) !== Number(run.agentId))
      throw new YusufOSError(
        ErrorCodes.UNAUTHORIZED,
        "Only the Agent currently assigned to the task may reason for it.",
        { status: 403 }
      );

    await this.#acquireLease({
      runId: run.id,
      leaseId,
      maxWallClockMs: limits.maxWallClockMs,
    });
    run = await this.#loadRun(run.id);

    const toolset = this.buildToolset({
      agentKey: definition.key,
      db: this.db,
    });
    const capabilities = definition.allowedCapabilities.map((key) => {
      const capability = getCapability(key);
      return { key, description: capability?.description || "" };
    });
    const modelPolicy = resolveAgentModelPolicy(definition);
    const reasoningState = parseReasoningState(run.reasoningState);
    if (!reasoningState.startedAtMs) reasoningState.startedAtMs = this.clock();
    const startedAt = reasoningState.startedAtMs;
    const totals = {
      tokens: reasoningState.tokens,
      knownCostMicros: reasoningState.knownCostMicros,
    };
    const recentToolResults = [];
    const actionFingerprints = new Set(reasoningState.fingerprints);
    let toolCalls = reasoningState.toolCalls;
    const persistedHandoffs = await this.db.yusuf_handoffs.count({
      where: { taskId: run.taskId },
    });
    let handoffs = Math.max(reasoningState.handoffs, persistedHandoffs);
    reasoningState.handoffs = handoffs;
    const retryState = { count: reasoningState.retries };
    await this.#saveReasoningState(run.id, leaseId, reasoningState);

    while (reasoningState.steps < limits.maxReasoningSteps) {
      this.#assertBudget({ startedAt, limits, totals, signal });
      this.#assertCanStartCompletion(limits, totals);
      await this.#assertRunActive(run.id);
      reasoningState.steps += 1;
      const step = reasoningState.steps;
      await this.#saveReasoningState(run.id, leaseId, reasoningState);
      const promptInput = {
        agentDefinition: definition,
        objective: run.task.objective,
        project: run.task.project
          ? {
              uuid: run.task.project.uuid,
              key: run.task.project.key,
              name: run.task.project.name,
              metadata: run.task.project.metadata,
            }
          : null,
        memory: scopedMemory,
        knowledge: scopedKnowledge,
        evidenceRefs: run.task.evidence.map((item) => ({
          uuid: item.uuid,
          kind: item.kind,
          status: item.status,
          digest: item.digest,
        })),
        recentToolResults,
        capabilities,
        policySummary:
          "Every capability crosses server policy. External mutations require valid human approval. Model text has no authority.",
        runState: { runId: run.uuid, status: RUN_STATUSES.RUNNING, step },
      };
      const messages = this.prompts.assembleMessages(promptInput);
      const prompt = messages
        .map((message) => `[${message.role}]\n${message.content}`)
        .join("\n\n");
      const promptTokenReservation = Buffer.byteLength(
        JSON.stringify(messages),
        "utf8"
      );
      const remainingModelTokens = limits.maxModelTokens - totals.tokens;
      if (promptTokenReservation >= remainingModelTokens)
        throw new YusufOSError(
          ErrorCodes.CONFLICT,
          "The assembled prompt exceeds the remaining total token budget.",
          {
            status: 409,
            details: { promptTokenReservation, remainingModelTokens },
          }
        );
      await this.db.yusuf_agent_runs.update({
        where: { id: run.id },
        data: { promptDigest: promptDigest({ prompt }) },
      });

      const completionController = new AbortController();
      const abortFromCaller = () => completionController.abort();
      if (signal?.aborted) completionController.abort();
      else signal?.addEventListener("abort", abortFromCaller, { once: true });
      const remainingMs = Math.max(
        1,
        limits.maxWallClockMs - (this.clock() - startedAt)
      );
      const deadline = setTimeout(
        () => completionController.abort(),
        remainingMs
      );
      let completion;
      try {
        completion = await this.#completeModel({
          run,
          definition,
          prompt,
          messages,
          step,
          limits,
          retryState,
          signal: completionController.signal,
          maxCompletionTokens: Math.max(
            1,
            remainingModelTokens - promptTokenReservation
          ),
          promptTokenEstimate: promptTokenReservation,
          maxKnownCostMicros:
            limits.maxKnownCostMicros - totals.knownCostMicros,
          modelPolicy,
          onRetry: async (retryCount) => {
            reasoningState.retries = retryCount;
            await this.#saveReasoningState(run.id, leaseId, reasoningState);
          },
        });
      } finally {
        clearTimeout(deadline);
        signal?.removeEventListener("abort", abortFromCaller);
      }
      if (completion.routed)
        await this.runs.recordModelCompletion({
          runId: run.id,
          routed: completion.routed,
        });
      const usage = completion.routed?.usage || completion.usage;
      const reportedTokens =
        Number.isSafeInteger(usage?.totalTokens) && usage.totalTokens >= 0
          ? usage.totalTokens
          : null;
      const conservativeTokens =
        promptTokenReservation +
        Buffer.byteLength(String(completion.content || ""), "utf8");
      totals.tokens +=
        reportedTokens === null ||
        (reportedTokens === 0 && String(completion.content || "").length > 0)
          ? conservativeTokens
          : reportedTokens;
      const cost = completion.routed?.cost;
      if (
        cost?.confidence !== "UNAVAILABLE" &&
        Number.isFinite(cost?.amountMicros)
      )
        totals.knownCostMicros += cost.amountMicros;
      reasoningState.tokens = totals.tokens;
      reasoningState.knownCostMicros = totals.knownCostMicros;
      await this.#saveReasoningState(run.id, leaseId, reasoningState);
      this.#assertBudget({ startedAt, limits, totals, signal });

      const decision = AgentDecision(completion.content);
      if (
        decision.type === AGENT_DECISION_TYPES.REVIEW_VERDICT &&
        definition.key !== "reviewer"
      )
        throw new YusufOSError(
          ErrorCodes.UNAUTHORIZED,
          "Only the Reviewer may return a review verdict.",
          { status: 403 }
        );
      if (
        definition.key === "reviewer" &&
        decision.type === AGENT_DECISION_TYPES.COMPLETE
      )
        throw new YusufOSError(
          ErrorCodes.VALIDATION_ERROR,
          "Reviewer runs must return REVIEW_VERDICT, not COMPLETE.",
          { status: 422 }
        );
      const reviewVerdict =
        decision.type === AGENT_DECISION_TYPES.REVIEW_VERDICT
          ? {
              verdict: decision.verdict,
              summary: decision.summary,
              findings: decision.findings,
            }
          : null;
      const fingerprint = canonicalHash({
        type: decision.type,
        capability: decision.capability || null,
        arguments: decision.arguments || null,
        targetAgent: decision.targetAgent || null,
      });
      if (actionFingerprints.has(fingerprint))
        throw new YusufOSError(
          ErrorCodes.CONFLICT,
          "Repeated identical Agent action was refused.",
          { status: 409, details: { type: decision.type } }
        );
      if (!reviewVerdict) {
        actionFingerprints.add(fingerprint);
        reasoningState.fingerprints = Array.from(actionFingerprints);
        await this.#saveReasoningState(run.id, leaseId, reasoningState);
      }

      if (reviewVerdict) {
        if (!completion.routed)
          throw new YusufOSError(
            ErrorCodes.UNAUTHORIZED,
            "Reviewer verdicts require routed model provenance.",
            { status: 403 }
          );
        await this.runs.recordRoutedReviewDecision({
          runId: run.id,
          leaseId,
          decision: reviewVerdict,
        });
        const inbound = await this.db.yusuf_handoffs.findFirst({
          where: { toRunId: run.id, status: "ACCEPTED" },
          orderBy: { id: "desc" },
        });
        const verdict = await this.reviews.submitVerdict({
          reviewRunId: run.id,
          targetRunId: inbound?.fromRunId || null,
          rawVerdict: reviewVerdict,
          requestId,
          finalizeRun: true,
          leaseId,
        });
        return {
          outcome: RUN_STATUSES.COMPLETED,
          runId: run.uuid,
          reviewVerdict: verdict.verdict,
          steps: step,
          toolCalls,
          totals,
        };
      }

      if (decision.type === AGENT_DECISION_TYPES.CALL_CAPABILITY) {
        if (toolCalls >= limits.maxToolCalls)
          throw new YusufOSError(
            ErrorCodes.CONFLICT,
            "Agent reasoning exceeded its tool-call budget.",
            { status: 409 }
          );
        toolCalls += 1;
        reasoningState.toolCalls = toolCalls;
        await this.#saveReasoningState(run.id, leaseId, reasoningState);
        let result;
        const operationController = new AbortController();
        const abortOperation = () => operationController.abort();
        if (signal?.aborted) operationController.abort();
        else signal?.addEventListener("abort", abortOperation, { once: true });
        const operationDeadline = setTimeout(
          () => operationController.abort(),
          Math.max(1, limits.maxWallClockMs - (this.clock() - startedAt))
        );
        try {
          result = await this.invokeCapability({
            toolset,
            capabilityKey: decision.capability,
            args: decision.arguments,
            runtimeContext: {
              requestId,
              principal: { type: PRINCIPAL_TYPES.AGENT, id: run.agent.uuid },
              agentId: run.agentId,
              taskId: run.taskId,
              runId: run.id,
              signal: operationController.signal,
            },
          });
        } catch (error) {
          result = {
            ok: false,
            code: error?.code || "TOOL_ERROR",
            message: String(error?.message || error),
          };
        } finally {
          clearTimeout(operationDeadline);
          signal?.removeEventListener("abort", abortOperation);
        }
        recentToolResults.push({
          capability: decision.capability,
          result: boundedResult(result),
        });
        const status = await this.#runStatus(run.id);
        if (status === RUN_STATUSES.WAITING_APPROVAL)
          return {
            outcome: RUN_STATUSES.WAITING_APPROVAL,
            runId: run.uuid,
            steps: step,
            toolCalls,
            totals,
          };
        if (status !== RUN_STATUSES.RUNNING)
          throw new YusufOSError(
            ErrorCodes.INVALID_STATE_TRANSITION,
            "Capability execution terminalized the run; reasoning stopped.",
            { status: 409, details: { status } }
          );
        continue;
      }

      if (decision.type === AGENT_DECISION_TYPES.HANDOFF) {
        if (handoffs >= limits.maxHandoffs)
          throw new YusufOSError(
            ErrorCodes.CONFLICT,
            "Agent reasoning exceeded its handoff budget.",
            { status: 409 }
          );
        handoffs += 1;
        reasoningState.handoffs = handoffs;
        await this.#saveReasoningState(run.id, leaseId, reasoningState);
        const handoff = await this.#createHandoff({
          run,
          targetAgentKey: decision.targetAgent,
          reason: decision.reason,
          requestId,
          handoffCount: handoffs,
        });
        return {
          outcome: RUN_STATUSES.WAITING_HANDOFF,
          runId: run.uuid,
          steps: step,
          toolCalls,
          handoffs,
          nextRunId: handoff.nextRun.uuid,
          totals,
        };
      }

      if (decision.type === AGENT_DECISION_TYPES.WAIT_FOR_USER) {
        await this.runs.transition({
          runId: run.id,
          to: RUN_STATUSES.BLOCKED,
          data: { blockedReason: "WAITING_FOR_USER" },
          requestId,
          eventType: "agent.run.waiting_user",
        });
        return {
          outcome: "WAITING_FOR_USER",
          runId: run.uuid,
          reason: redactForPersistence(decision.reason),
          steps: step,
          toolCalls,
          totals,
        };
      }

      // COMPLETE ends only this Agent's turn. It does not modify the Task,
      // create evidence, submit a review, or invoke CompletionPolicy.
      const persistedEvidenceRefs = new Set(
        run.task.evidence.map((item) => item.uuid)
      );
      const unknownEvidenceRefs = decision.evidenceRefs.filter(
        (reference) => !persistedEvidenceRefs.has(reference)
      );
      if (unknownEvidenceRefs.length)
        throw new YusufOSError(
          ErrorCodes.VALIDATION_ERROR,
          "Agent completion referenced evidence that is not persisted on this task.",
          { status: 422, details: { unknownEvidenceRefs } }
        );
      await this.runs.transition({
        runId: run.id,
        to: RUN_STATUSES.COMPLETED,
        data: { completedAt: new Date() },
        requestId,
        eventType: "agent.run.completed",
      });
      return {
        outcome: RUN_STATUSES.COMPLETED,
        runId: run.uuid,
        summary: redactForPersistence(decision.summary),
        evidenceRefs: decision.evidenceRefs,
        steps: step,
        toolCalls,
        totals,
      };
    }

    throw new YusufOSError(
      ErrorCodes.CONFLICT,
      "Agent reasoning exceeded its step budget.",
      { status: 409 }
    );
  }

  async execute(args) {
    const leaseId = randomUUID();
    try {
      return await this.#execute({ ...args, leaseId });
    } catch (error) {
      const runId = Number(args?.runId);
      if (Number.isInteger(runId)) {
        const cancelled = Boolean(args?.signal?.aborted);
        const failureKind =
          error?.code === ErrorCodes.VALIDATION_ERROR
            ? RUN_FAILURE_KINDS.CONTRACT_VIOLATION
            : error?.code === ErrorCodes.MODEL_UNAVAILABLE
              ? RUN_FAILURE_KINDS.MODEL_UNAVAILABLE
              : RUN_FAILURE_KINDS.AGENT_REASONING;
        try {
          await this.runs.terminalizeReasoningFailure({
            runId,
            leaseId,
            cancelled,
            failureKind,
            message: String(error?.message || error),
            requestId: args?.requestId,
          });
        } catch {
          // Preserve the original failure. Only the current lease owner may
          // terminalize, and any concurrent transition remains authoritative.
        }
      }
      throw error;
    } finally {
      const runId = Number(args?.runId);
      if (Number.isInteger(runId)) await this.#releaseLease(runId, leaseId);
    }
  }
}

module.exports = {
  AgentReasoningLoop,
  DEFAULT_LIMITS,
  REQUIRED_REASONING_CAPABILITIES,
  limitsWithDefaults,
};
