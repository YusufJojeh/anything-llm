const { IntentService } = require("../actions/IntentService");
const { PolicyEngine } = require("../policy/PolicyEngine");
const { POLICY_OUTCOMES } = require("../constants");
const { YusufOSError, ErrorCodes } = require("../errors/YusufOSError");

const RUNTIME_OWNED_FIELDS = Object.freeze([
  "principal",
  "agentId",
  "taskId",
  "runId",
  "requestId",
]);

function assertNotCancelled(signal) {
  if (signal?.aborted)
    throw new YusufOSError(
      ErrorCodes.CONFLICT,
      "Governed capability dispatch was cancelled.",
      { status: 409 }
    );
}

/**
 * The sole runtime entry point for Yusuf-governed tool execution.
 * A governed tool's legacy handler is deliberately never called here.
 */
class YusufActionBoundary {
  #bindings = new WeakMap();

  constructor({
    intentService = new IntentService(),
    policyEngine = new PolicyEngine(),
    executionCoordinatorFactory,
  } = {}) {
    this.intentService = intentService;
    this.policyEngine = policyEngine;
    this.executionCoordinatorFactory = executionCoordinatorFactory;
  }

  bindTool({
    name,
    description,
    parameters = { type: "object", properties: {} },
    capability,
    buildActionRequest,
  }) {
    if (!name || !capability || typeof buildActionRequest !== "function")
      throw new TypeError(
        "A governed tool requires name, capability, and a trusted request builder."
      );
    const functionConfig = Object.freeze({
      name,
      description,
      parameters,
      handler: async () => {
        throw new YusufOSError(
          ErrorCodes.POLICY_DENIED,
          "Governed tools cannot execute through a direct handler.",
          { status: 403 }
        );
      },
    });
    this.#bindings.set(
      functionConfig,
      Object.freeze({ capability, buildActionRequest })
    );
    return functionConfig;
  }

  isRegistered(functionConfig) {
    return this.#bindings.has(functionConfig);
  }

  async dispatch({ functionConfig, arguments: args, runtimeContext }) {
    const binding = this.#bindings.get(functionConfig);
    if (!binding)
      throw new YusufOSError(
        ErrorCodes.POLICY_DENIED,
        "A governed runtime may invoke only tools registered by its Action Boundary.",
        { status: 403 }
      );

    if (!runtimeContext?.requestId)
      throw new YusufOSError(
        ErrorCodes.VALIDATION_ERROR,
        "A governed runtime requires a server correlation ID.",
        { status: 422 }
      );
    assertNotCancelled(runtimeContext.signal);
    const semanticRequest = await binding.buildActionRequest(args);
    assertNotCancelled(runtimeContext.signal);
    const suppliedIdentity = RUNTIME_OWNED_FIELDS.filter((field) =>
      Object.prototype.hasOwnProperty.call(semanticRequest || {}, field)
    );
    if (suppliedIdentity.length)
      throw new YusufOSError(
        ErrorCodes.VALIDATION_ERROR,
        "Governed tools cannot supply runtime identity or ownership fields.",
        { status: 422, details: { forbiddenFields: suppliedIdentity } }
      );
    const actionRequest = {
      ...semanticRequest,
      capability: binding.capability,
      principal: runtimeContext.principal,
      agentId: runtimeContext.agentId,
      taskId: runtimeContext.taskId,
      runId: runtimeContext.runId,
    };

    const intent = await this.intentService.create(actionRequest, {
      requestId: runtimeContext.requestId,
    });
    const policy = await this.policyEngine.evaluate(intent.id);

    if (policy.decision.outcome === POLICY_OUTCOMES.REQUIRE_APPROVAL)
      return {
        state: "WAITING_APPROVAL",
        intentId: intent.uuid,
        approvalId: policy.approval.uuid,
      };

    if (policy.decision.outcome !== POLICY_OUTCOMES.ALLOW)
      throw new YusufOSError(
        policy.decision.outcome === POLICY_OUTCOMES.FORBIDDEN
          ? ErrorCodes.ACTION_FORBIDDEN
          : ErrorCodes.POLICY_DENIED,
        "The Yusuf policy decision does not authorize execution.",
        { status: 403, details: { outcome: policy.decision.outcome } }
      );

    if (typeof this.executionCoordinatorFactory !== "function")
      throw new YusufOSError(
        ErrorCodes.POLICY_DENIED,
        "No governed execution adapter is available for this capability.",
        { status: 503 }
      );
    const coordinator = await this.executionCoordinatorFactory({
      capability: binding.capability,
      intent,
      runtimeContext,
    });
    return coordinator.execute(intent.id, runtimeContext);
  }
}

module.exports = {
  YusufActionBoundary,
  RUNTIME_OWNED_FIELDS,
  assertNotCancelled,
};
