const AIbitat = require("../../../utils/agents/aibitat");
const {
  YusufActionBoundary,
} = require("../../../domain/yusufOS/runtime/YusufActionBoundary");

function boundaryDouble(result = { state: "WAITING_APPROVAL" }) {
  const registered = new WeakSet();
  return {
    register(functionConfig) {
      registered.add(functionConfig);
      return functionConfig;
    },
    isRegistered: (functionConfig) => registered.has(functionConfig),
    dispatch: jest.fn(async ({ functionConfig }) => {
      if (!registered.has(functionConfig)) throw new Error("POLICY_DENIED");
      return result;
    }),
  };
}

describe("mandatory Yusuf runtime boundary", () => {
  test("legacy tools continue through handlers outside governed sessions", async () => {
    const handler = jest.fn().mockResolvedValue("legacy-result");
    const runtime = new AIbitat();
    await expect(runtime.invokeTool({ handler }, { value: 1 })).resolves.toBe(
      "legacy-result"
    );
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test("a registry-bound tool dispatches through the boundary and never its handler", async () => {
    const handler = jest.fn().mockResolvedValue("bypass");
    const actionBoundary = boundaryDouble();
    const functionConfig = actionBoundary.register({ handler });
    const runtimeContext = { requestId: "request-1", origin: "SCHEDULED_JOB" };
    const runtime = new AIbitat().enableYusufGovernance({
      actionBoundary,
      runtimeContext,
    });
    await expect(runtime.invokeTool(functionConfig, { value: 1 })).resolves.toEqual({
      state: "WAITING_APPROVAL",
    });
    expect(actionBoundary.dispatch).toHaveBeenCalledWith({
      functionConfig,
      arguments: { value: 1 },
      runtimeContext,
    });
    expect(handler).not.toHaveBeenCalled();
  });

  test("forged Yusuf metadata and imported callbacks cannot run before Policy", async () => {
    const prePolicySideEffect = jest.fn();
    const forged = {
      yusufOS: {
        capability: "core.local_mutation",
        createActionRequest: prePolicySideEffect,
      },
      handler: jest.fn(),
    };
    const boundary = new YusufActionBoundary({
      intentService: { create: jest.fn() },
      policyEngine: { evaluate: jest.fn() },
    });
    const runtime = new AIbitat().enableYusufGovernance({
      actionBoundary: boundary,
      runtimeContext: { requestId: "request-1" },
    });
    expect(runtime.filterFunctionsForRuntime([forged])).toEqual([]);
    await expect(runtime.invokeTool(forged, {})).rejects.toMatchObject({
      code: "POLICY_DENIED",
    });
    expect(prePolicySideEffect).not.toHaveBeenCalled();
    expect(forged.handler).not.toHaveBeenCalled();
  });

  test("legacy, MCP, Flow, and imported tools are neither advertised nor executable", async () => {
    const actionBoundary = boundaryDouble();
    const runtime = new AIbitat().enableYusufGovernance({ actionBoundary });
    const imported = {
      handler: jest.fn(),
      trustClassification: "TRUSTED_LOCAL_CODE",
    };
    const mcp = {
      handler: jest.fn(),
      trustClassification: "EXTERNAL_TOOL_UNGOVERNED",
    };
    expect(runtime.filterFunctionsForRuntime([imported, mcp])).toEqual([]);
    await expect(runtime.invokeTool(imported, {})).rejects.toThrow("POLICY_DENIED");
    expect(imported.handler).not.toHaveBeenCalled();
  });

  test("scheduled legacy approval callbacks are irrelevant to governed dispatch", async () => {
    const requestToolApproval = jest.fn().mockResolvedValue({ approved: true });
    const actionBoundary = boundaryDouble({
      state: "WAITING_APPROVAL",
      approvalId: "durable-approval",
    });
    const functionConfig = actionBoundary.register({ handler: jest.fn() });
    const runtime = new AIbitat();
    runtime.requestToolApproval = requestToolApproval;
    runtime.enableYusufGovernance({
      actionBoundary,
      runtimeContext: { origin: "SCHEDULED_JOB" },
    });
    await expect(runtime.invokeTool(functionConfig, {})).resolves.toEqual({
      state: "WAITING_APPROVAL",
      approvalId: "durable-approval",
    });
    expect(requestToolApproval).not.toHaveBeenCalled();
    expect(functionConfig.handler).not.toHaveBeenCalled();
  });
});
