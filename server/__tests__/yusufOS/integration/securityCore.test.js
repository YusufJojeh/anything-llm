const { randomUUID } = require("crypto");
const {
  createTestDatabase,
  clearYusufTables,
} = require("../../../__testUtils__/yusufOS/testDatabase");
const {
  IntentService,
} = require("../../../domain/yusufOS/actions/IntentService");
const { PolicyEngine } = require("../../../domain/yusufOS/policy/PolicyEngine");
const {
  ApprovalService,
} = require("../../../domain/yusufOS/approvals/ApprovalService");
const {
  ExecutionCoordinator,
} = require("../../../domain/yusufOS/execution/ExecutionCoordinator");
const {
  InMemoryTestAdapter,
} = require("../../../domain/yusufOS/execution/InMemoryTestAdapter");
const {
  SecuritySettings,
} = require("../../../domain/yusufOS/security/SecuritySettings");
const { AuditService } = require("../../../domain/yusufOS/audit/AuditService");
const {
  canonicalHash,
} = require("../../../domain/yusufOS/security/canonicalJson");
const {
  YusufActionBoundary,
} = require("../../../domain/yusufOS/runtime/YusufActionBoundary");

describe("Yusuf OS deterministic security core", () => {
  let testDatabase;
  let db;

  beforeAll(async () => {
    testDatabase = await createTestDatabase();
    db = testDatabase.db;
  }, 120000);

  afterAll(async () => {
    if (testDatabase) await testDatabase.cleanup();
  });
  beforeEach(async () => clearYusufTables(db));

  async function seed(
    capabilityKey,
    { grant = true, principalType = "AGENT", principalId: suppliedId } = {}
  ) {
    const requestId = randomUUID();
    const agent = await db.yusuf_agents.create({
      data: {
        uuid: randomUUID(),
        key: `agent-${randomUUID()}`,
        name: "Gate C Agent",
        mission: "Prove deterministic policy.",
        instructions: "Use only governed capabilities.",
        status: "ACTIVE",
      },
    });
    const principalId =
      suppliedId || (principalType === "SCHEDULE" ? "schedule-1" : agent.uuid);
    const task = await db.yusuf_tasks.create({
      data: {
        uuid: randomUUID(),
        assignedAgentId: agent.id,
        requestedByPrincipalType: principalType,
        requestedByPrincipalId: principalId,
        title: "Gate C policy test",
        objective: "Exercise a governed intent.",
        status: "RUNNING",
        requestId,
      },
    });
    const run = await db.yusuf_agent_runs.create({
      data: {
        uuid: randomUUID(),
        taskId: task.id,
        agentId: agent.id,
        requestedByPrincipalType: principalType,
        requestedByPrincipalId: principalId,
        status: "RUNNING",
        requestId,
      },
    });
    if (grant)
      await db.yusuf_agent_capabilities.create({
        data: {
          agentId: agent.id,
          capabilityKey,
          capabilityVersion: 1,
        },
      });
    return { agent, task, run, requestId, principalId };
  }

  async function createAndEvaluate(capabilityKey, options = {}) {
    const seeded = await seed(capabilityKey, options);
    const actionRequest = {
      principal: {
        type: options.principalType || "AGENT",
        id: seeded.principalId,
      },
      agentId: seeded.agent.id,
      taskId: seeded.task.id,
      runId: seeded.run.id,
      capability: capabilityKey,
      resource: {
        type: "TEST_RESOURCE",
        id: "resource-1",
        version: "v1",
      },
      target: { account: "local-test" },
      environment: "TEST",
      payload: options.payload || { z: 2, a: 1 },
    };
    const intent = await new IntentService(db).create(actionRequest, {
      requestId: seeded.requestId,
    });
    const policy = await new PolicyEngine(db, options.policyOptions).evaluate(
      intent.id
    );
    return { ...seeded, actionRequest, intent, policy };
  }

  async function approve(context) {
    const intent = await db.yusuf_action_intents.findUnique({
      where: { id: context.intent.id },
    });
    const approval = await db.yusuf_approval_requests.findUnique({
      where: { intentId: intent.id },
    });
    return new ApprovalService(db).decide(approval.id, {
      decision: "APPROVE",
      expectedPayloadHash: approval.payloadHash,
      expectedIntentVersion: intent.version,
      expectedApprovalVersion: approval.version,
      principal: { type: "USER", id: "yusuf" },
      requestId: context.requestId,
    });
  }

  test("granted L2 policy allows and verified execution occurs once", async () => {
    const context = await createAndEvaluate("core.local_mutation");
    expect(context.policy.decision).toMatchObject({
      outcome: "ALLOW",
      riskLevel: "L2",
    });
    const adapter = new InMemoryTestAdapter();
    const coordinator = new ExecutionCoordinator({ db, adapter });
    const receipt = await coordinator.execute(context.intent.id, {
      requestId: context.requestId,
      resourceVersion: "v1",
    });
    expect(receipt).toMatchObject({
      outcome: "SUCCEEDED",
      verificationStatus: "VERIFIED",
    });
    expect(adapter.executionCount).toBe(1);
    await expect(coordinator.execute(context.intent.id)).resolves.toMatchObject(
      {
        verificationStatus: "VERIFIED",
      }
    );
    const duplicateIntent = await new IntentService(db).create(
      context.actionRequest,
      { requestId: context.requestId }
    );
    expect(duplicateIntent.id).toBe(context.intent.id);
    expect(await db.yusuf_action_intents.count()).toBe(1);
    await expect(
      new PolicyEngine(db).evaluate(duplicateIntent.id)
    ).resolves.toMatchObject({
      status: "VERIFIED",
    });
    expect(adapter.executionCount).toBe(1);
  });

  test("L3 produces durable approval and zero execution before approval", async () => {
    const context = await createAndEvaluate("core.external_mutation");
    const adapter = new InMemoryTestAdapter();
    expect(context.policy.decision.outcome).toBe("REQUIRE_APPROVAL");
    expect(context.policy.approval.status).toBe("PENDING");
    await expect(
      new ExecutionCoordinator({ db, adapter }).execute(context.intent.id)
    ).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });
    expect(adapter.executionCount).toBe(0);
  });

  test("Action Boundary routes governed L2 execution and L3 schedule to durable approval", async () => {
    const local = await seed("core.local_mutation");
    const localAdapter = new InMemoryTestAdapter();
    const localBoundary = new YusufActionBoundary({
      intentService: new IntentService(db),
      policyEngine: new PolicyEngine(db),
      executionCoordinatorFactory: () =>
        new ExecutionCoordinator({ db, adapter: localAdapter }),
    });
    const makeRequest = () => ({
      resource: { type: "TEST_RESOURCE", id: "resource-1", version: "v1" },
      target: { account: "local-test" },
      environment: "TEST",
      payload: { action: "prove-boundary" },
    });
    const localTool = localBoundary.bindTool({
      name: "gate-c-local",
      capability: "core.local_mutation",
      buildActionRequest: makeRequest,
    });
    await expect(
      localBoundary.dispatch({
        functionConfig: localTool,
        arguments: {},
        runtimeContext: {
          requestId: local.requestId,
          principal: { type: "AGENT", id: local.agent.uuid },
          agentId: local.agent.id,
          taskId: local.task.id,
          runId: local.run.id,
          resourceVersion: "v1",
        },
      })
    ).resolves.toMatchObject({ verificationStatus: "VERIFIED" });
    expect(localAdapter.executionCount).toBe(1);

    await clearYusufTables(db);
    const scheduled = await seed("core.external_mutation", {
      principalType: "SCHEDULE",
    });
    const scheduledAdapter = new InMemoryTestAdapter();
    const scheduledBoundary = new YusufActionBoundary({
      intentService: new IntentService(db),
      policyEngine: new PolicyEngine(db),
      executionCoordinatorFactory: () =>
        new ExecutionCoordinator({ db, adapter: scheduledAdapter }),
    });
    const scheduledTool = scheduledBoundary.bindTool({
      name: "gate-c-scheduled",
      capability: "core.external_mutation",
      buildActionRequest: makeRequest,
    });
    await expect(
      scheduledBoundary.dispatch({
        functionConfig: scheduledTool,
        arguments: {},
        runtimeContext: {
          requestId: scheduled.requestId,
          principal: { type: "SCHEDULE", id: scheduled.principalId },
          agentId: scheduled.agent.id,
          taskId: scheduled.task.id,
          runId: scheduled.run.id,
          origin: "SCHEDULED_JOB",
        },
      })
    ).resolves.toMatchObject({ state: "WAITING_APPROVAL" });
    expect(scheduledAdapter.executionCount).toBe(0);
    expect(
      await db.yusuf_approval_requests.count({ where: { status: "PENDING" } })
    ).toBe(1);
    expect(
      (
        await db.yusuf_agent_runs.findUnique({
          where: { id: scheduled.run.id },
        })
      ).status
    ).toBe("WAITING_APPROVAL");
  });

  test("valid approval executes once and is consumed", async () => {
    const context = await createAndEvaluate("core.external_mutation");
    await approve(context);
    const adapter = new InMemoryTestAdapter();
    const coordinator = new ExecutionCoordinator({ db, adapter });
    await expect(
      coordinator.execute(context.intent.id, { resourceVersion: "v1" })
    ).resolves.toMatchObject({ verificationStatus: "VERIFIED" });
    expect(adapter.executionCount).toBe(1);
    expect(
      (
        await db.yusuf_approval_requests.findUnique({
          where: { intentId: context.intent.id },
        })
      ).status
    ).toBe("CONSUMED");
    expect(
      (await db.yusuf_agent_runs.findUnique({ where: { id: context.run.id } }))
        .status
    ).toBe("RUNNING");
    await coordinator.execute(context.intent.id);
    expect(adapter.executionCount).toBe(1);
  });

  test("rejected approval makes execution impossible", async () => {
    const context = await createAndEvaluate("core.external_mutation");
    const intent = await db.yusuf_action_intents.findUnique({
      where: { id: context.intent.id },
    });
    const approval = context.policy.approval;
    await new ApprovalService(db).decide(approval.id, {
      decision: "REJECT",
      expectedPayloadHash: approval.payloadHash,
      expectedIntentVersion: intent.version,
      expectedApprovalVersion: approval.version,
      principal: { type: "USER", id: "yusuf" },
    });
    const adapter = new InMemoryTestAdapter();
    await expect(
      new ExecutionCoordinator({ db, adapter }).execute(intent.id)
    ).rejects.toMatchObject({
      code: "APPROVAL_REQUIRED",
    });
    expect(adapter.executionCount).toBe(0);
  });

  test("expired approval is persisted expired and cannot execute", async () => {
    const context = await createAndEvaluate("core.external_mutation", {
      policyOptions: { approvalTtlMs: -1 },
    });
    const intent = await db.yusuf_action_intents.findUnique({
      where: { id: context.intent.id },
    });
    await expect(
      new ApprovalService(db).decide(context.policy.approval.id, {
        decision: "APPROVE",
        expectedPayloadHash: context.policy.approval.payloadHash,
        expectedIntentVersion: intent.version,
        expectedApprovalVersion: context.policy.approval.version,
        principal: { type: "USER", id: "yusuf" },
      })
    ).rejects.toMatchObject({ code: "APPROVAL_EXPIRED" });
    expect(
      (
        await db.yusuf_approval_requests.findUnique({
          where: { id: context.policy.approval.id },
        })
      ).status
    ).toBe("EXPIRED");
  });

  test("an approved action that expires before consumption cannot execute", async () => {
    const context = await createAndEvaluate("core.external_mutation");
    await approve(context);
    await db.yusuf_approval_requests.update({
      where: { intentId: context.intent.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const adapter = new InMemoryTestAdapter();
    await expect(
      new ExecutionCoordinator({ db, adapter }).execute(context.intent.id)
    ).rejects.toMatchObject({ code: "APPROVAL_EXPIRED" });
    expect(adapter.executionCount).toBe(0);
    expect(
      (
        await db.yusuf_approval_requests.findUnique({
          where: { intentId: context.intent.id },
        })
      ).status
    ).toBe("EXPIRED");
  });

  test.each([
    [
      "payload hash",
      async (ctx) =>
        db.yusuf_action_intents.update({
          where: { id: ctx.intent.id },
          data: { payloadHash: canonicalHash({ changed: true }) },
        }),
      "PAYLOAD_CHANGED",
    ],
    [
      "intent version",
      async (ctx) =>
        db.yusuf_action_intents.update({
          where: { id: ctx.intent.id },
          data: { version: { increment: 1 } },
        }),
      "INTENT_VERSION_CHANGED",
    ],
  ])("%s change invalidates prior approval", async (_label, mutate, reason) => {
    const context = await createAndEvaluate("core.external_mutation");
    await approve(context);
    await mutate(context);
    const adapter = new InMemoryTestAdapter();
    await expect(
      new ExecutionCoordinator({ db, adapter }).execute(context.intent.id)
    ).rejects.toMatchObject({
      code: "APPROVAL_INVALIDATED",
      details: { reason },
    });
    expect(adapter.executionCount).toBe(0);
    expect(
      (
        await db.yusuf_approval_requests.findUnique({
          where: { intentId: context.intent.id },
        })
      ).status
    ).toBe("INVALIDATED");
  });

  test("resource version change invalidates prior approval", async () => {
    const context = await createAndEvaluate("core.external_mutation");
    await approve(context);
    const adapter = new InMemoryTestAdapter();
    adapter.preflight = async () => ({
      accountIdentity: "local-test",
      resourceVersion: "v2",
      targetIdentityDigest: context.intent.targetIdentityDigest,
    });
    await expect(
      new ExecutionCoordinator({ db, adapter }).execute(context.intent.id)
    ).rejects.toMatchObject({ code: "APPROVAL_INVALIDATED" });
    expect(adapter.executionCount).toBe(0);
  });

  test("live account identity change invalidates prior approval", async () => {
    const context = await createAndEvaluate("core.external_mutation");
    await approve(context);
    const adapter = new InMemoryTestAdapter();
    adapter.preflight = async () => ({
      accountIdentity: "different-account",
      resourceVersion: "v1",
      targetIdentityDigest: context.intent.targetIdentityDigest,
    });
    await expect(
      new ExecutionCoordinator({ db, adapter }).execute(context.intent.id)
    ).rejects.toMatchObject({
      code: "APPROVAL_INVALIDATED",
      details: { reason: "ACCOUNT_CHANGED" },
    });
    expect(adapter.executionCount).toBe(0);
  });

  test("hard forbidden persists FORBIDDEN, audits, and creates no approval", async () => {
    const context = await createAndEvaluate("credential.extract", {
      grant: false,
    });
    expect(context.policy.decision).toMatchObject({
      outcome: "FORBIDDEN",
      riskLevel: "L4",
    });
    expect(context.policy.approval).toBeNull();
    expect(await db.yusuf_approval_requests.count()).toBe(0);
    expect(
      await db.yusuf_audit_events.count({ where: { outcome: "FORBIDDEN" } })
    ).toBe(1);
    await expect(
      new ExecutionCoordinator({
        db,
        adapter: new InMemoryTestAdapter(),
      }).execute(context.intent.id)
    ).rejects.toMatchObject({ code: "ACTION_FORBIDDEN" });
  });

  test("missing grant denies an Agent", async () => {
    const context = await createAndEvaluate("core.local_mutation", {
      grant: false,
    });
    expect(context.policy.decision).toMatchObject({
      outcome: "DENY",
      reasonCode: "AGENT_CAPABILITY_NOT_GRANTED",
    });
  });

  test("runtime identity cannot bind an Agent to another Task or Run", async () => {
    const first = await seed("core.local_mutation");
    const second = await seed("core.local_mutation");
    await expect(
      new IntentService(db).create(
        {
          principal: { type: "AGENT", id: first.agent.uuid },
          agentId: first.agent.id,
          taskId: second.task.id,
          runId: first.run.id,
          capability: "core.local_mutation",
          resource: { type: "TEST_RESOURCE", id: "one" },
          target: {},
          payload: {},
        },
        { requestId: first.requestId }
      )
    ).rejects.toMatchObject({ code: "POLICY_DENIED" });
    expect(await db.yusuf_action_intents.count()).toBe(0);
  });

  test("double decision race has exactly one legal winner", async () => {
    const context = await createAndEvaluate("core.external_mutation");
    const intent = await db.yusuf_action_intents.findUnique({
      where: { id: context.intent.id },
    });
    const input = {
      expectedPayloadHash: context.policy.approval.payloadHash,
      expectedIntentVersion: intent.version,
      expectedApprovalVersion: context.policy.approval.version,
      principal: { type: "USER", id: "yusuf" },
    };
    const service = new ApprovalService(db);
    const results = await Promise.allSettled([
      service.decide(context.policy.approval.id, {
        ...input,
        decision: "APPROVE",
      }),
      service.decide(context.policy.approval.id, {
        ...input,
        decision: "REJECT",
      }),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled")
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected")
    ).toHaveLength(1);
    expect(["APPROVED", "REJECTED"]).toContain(
      (
        await db.yusuf_approval_requests.findUnique({
          where: { id: context.policy.approval.id },
        })
      ).status
    );
  });

  test("known pre-effect failure is FAILED while uncertain outcome requires reconciliation", async () => {
    const safe = await createAndEvaluate("core.local_mutation");
    const beforeAdapter = new InMemoryTestAdapter({
      execution: "THROW_BEFORE_EFFECT",
    });
    await expect(
      new ExecutionCoordinator({ db, adapter: beforeAdapter }).execute(
        safe.intent.id
      )
    ).resolves.toMatchObject({
      outcome: "FAILED",
      verificationStatus: "NOT_APPLIED",
    });

    await clearYusufTables(db);
    const uncertain = await createAndEvaluate("core.local_mutation");
    const unknownAdapter = new InMemoryTestAdapter({ execution: "UNKNOWN" });
    const coordinator = new ExecutionCoordinator({
      db,
      adapter: unknownAdapter,
    });
    await expect(
      coordinator.execute(uncertain.intent.id)
    ).resolves.toMatchObject({
      outcome: "UNKNOWN",
      verificationStatus: "UNKNOWN",
    });
    await expect(
      coordinator.execute(uncertain.intent.id)
    ).rejects.toMatchObject({
      code: "EXECUTION_UNKNOWN",
    });
    await expect(
      coordinator.reconcile(uncertain.intent.id)
    ).resolves.toMatchObject({
      verificationStatus: "NOT_APPLIED",
    });
  });

  test("verifier failure becomes FAILED_UNKNOWN and never reports success", async () => {
    const context = await createAndEvaluate("core.local_mutation");
    const adapter = new InMemoryTestAdapter();
    adapter.verify = async () => {
      throw new Error("Verifier unavailable");
    };
    const receipt = await new ExecutionCoordinator({ db, adapter }).execute(
      context.intent.id
    );
    expect(receipt).toMatchObject({
      outcome: "UNKNOWN",
      verificationStatus: "UNKNOWN",
    });
    expect(
      (
        await db.yusuf_action_intents.findUnique({
          where: { id: context.intent.id },
        })
      ).status
    ).toBe("FAILED_UNKNOWN");
    expect(
      (await db.yusuf_agent_runs.findUnique({ where: { id: context.run.id } }))
        .status
    ).toBe("FAILED_UNKNOWN");
  });

  test("only one concurrent reconciliation may claim an unknown receipt", async () => {
    const context = await createAndEvaluate("core.local_mutation");
    const adapter = new InMemoryTestAdapter({ execution: "UNKNOWN" });
    const coordinator = new ExecutionCoordinator({ db, adapter });
    await coordinator.execute(context.intent.id);
    const results = await Promise.allSettled([
      coordinator.reconcile(context.intent.id),
      coordinator.reconcile(context.intent.id),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled")
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected")
    ).toHaveLength(1);
  });

  test("unavailable or capability-mismatched adapters cannot claim execution", async () => {
    const unavailableContext = await createAndEvaluate("core.local_mutation");
    const unavailable = new InMemoryTestAdapter();
    unavailable.availability = async () => ({ status: "UNAVAILABLE" });
    await expect(
      new ExecutionCoordinator({ db, adapter: unavailable }).execute(
        unavailableContext.intent.id
      )
    ).rejects.toMatchObject({ code: "POLICY_DENIED" });
    expect(unavailable.executionCount).toBe(0);
    expect(await db.yusuf_action_receipts.count()).toBe(0);

    await clearYusufTables(db);
    const mismatchContext = await createAndEvaluate("core.local_mutation");
    const mismatch = new InMemoryTestAdapter();
    mismatch.descriptor = () => ({
      id: "wrong-adapter",
      kind: "TEST_ONLY",
      capabilities: ["core.external_mutation"],
    });
    await expect(
      new ExecutionCoordinator({ db, adapter: mismatch }).execute(
        mismatchContext.intent.id
      )
    ).rejects.toMatchObject({ code: "POLICY_DENIED" });
    expect(mismatch.executionCount).toBe(0);
    expect(await db.yusuf_action_receipts.count()).toBe(0);
  });

  test("kill switch blocks an already approved L3 without consuming it", async () => {
    const context = await createAndEvaluate("core.external_mutation");
    await approve(context);
    await new SecuritySettings(db).setExternalMutationsDisabled(true, {
      principal: { type: "USER", id: "yusuf" },
      requestId: context.requestId,
    });
    const adapter = new InMemoryTestAdapter();
    await expect(
      new ExecutionCoordinator({ db, adapter }).execute(context.intent.id)
    ).rejects.toMatchObject({
      code: "MUTATIONS_DISABLED",
    });
    expect(adapter.executionCount).toBe(0);
    expect(
      (
        await db.yusuf_approval_requests.findUnique({
          where: { intentId: context.intent.id },
        })
      ).status
    ).toBe("APPROVED");
  });

  test("nested secrets are redacted before receipt persistence", async () => {
    const context = await createAndEvaluate("core.local_mutation");
    const adapter = new InMemoryTestAdapter();
    adapter.execute = async () => ({
      externalReference: "test:redaction",
      result: {
        nested: {
          Authorization: "Bearer secret-value",
          refresh_token: "raw-token",
        },
        private_key: "do-not-store",
      },
    });
    const receipt = await new ExecutionCoordinator({ db, adapter }).execute(
      context.intent.id
    );
    expect(receipt.sanitizedResult).not.toContain("secret-value");
    expect(receipt.sanitizedResult).not.toContain("raw-token");
    expect(receipt.sanitizedResult).not.toContain("do-not-store");
    expect(receipt.sanitizedResult).toContain("[REDACTED]");
  });

  test("audit verifier detects mutation, deletion gaps, and previous-hash changes", async () => {
    const context = await createAndEvaluate("core.local_mutation");
    const audit = new AuditService(db);
    expect(await audit.verify()).toMatchObject({ valid: true });
    const first = await db.yusuf_audit_events.findFirst({
      orderBy: { sequence: "asc" },
    });
    await db.yusuf_audit_events.update({
      where: { id: first.id },
      data: { metadata: '{"changed":true}' },
    });
    expect(await audit.verify()).toMatchObject({
      valid: false,
      reason: "EVENT_HASH_MISMATCH",
    });

    await clearYusufTables(db);
    const deletionContext = await createAndEvaluate("core.local_mutation");
    await audit.append({
      eventType: "test.anchor",
      principal: { type: "SYSTEM", id: "test" },
      outcome: "ANCHORED",
      metadata: {},
      requestId: deletionContext.requestId,
    });
    const middle = await db.yusuf_audit_events.findFirst({
      where: { sequence: 2 },
    });
    await db.yusuf_audit_events.delete({ where: { id: middle.id } });
    expect(await audit.verify()).toMatchObject({
      valid: false,
      reason: "SEQUENCE_GAP",
    });

    await clearYusufTables(db);
    await createAndEvaluate("core.local_mutation");
    const second = await db.yusuf_audit_events.findFirst({
      where: { sequence: 2 },
    });
    await db.yusuf_audit_events.update({
      where: { id: second.id },
      data: { previousHash: "f".repeat(64) },
    });
    expect(await audit.verify()).toMatchObject({
      valid: false,
      reason: "PREVIOUS_HASH_MISMATCH",
    });
    expect(context.intent.uuid).toBeTruthy();
  });

  test("audit checkpoint detects tail truncation and full event deletion", async () => {
    const audit = new AuditService(db);
    await createAndEvaluate("core.local_mutation");
    const tail = await db.yusuf_audit_events.findFirst({
      orderBy: { sequence: "desc" },
    });
    await db.yusuf_audit_events.delete({ where: { id: tail.id } });
    expect(await audit.verify()).toMatchObject({
      valid: false,
      reason: "CHECKPOINT_MISMATCH",
    });

    await db.yusuf_audit_events.deleteMany();
    expect(await audit.verify()).toMatchObject({
      valid: false,
      reason: "CHECKPOINT_WITHOUT_EVENTS",
    });

    await db.yusuf_audit_checkpoints.deleteMany();
    expect(await audit.verify()).toMatchObject({
      valid: false,
      reason: "AUDIT_CHAIN_UNINITIALIZED",
    });
  });

  test("audit checkpoint rewrite without the HMAC key is detected", async () => {
    const audit = new AuditService(db);
    await createAndEvaluate("core.local_mutation");
    await db.yusuf_audit_checkpoints.update({
      where: { key: "PRIMARY" },
      data: { lastHash: "a".repeat(64) },
    });
    expect(await audit.verify()).toMatchObject({
      valid: false,
      reason: "CHECKPOINT_SIGNATURE_MISMATCH",
    });
  });

  test("concurrent standalone audit appends serialize into one valid chain", async () => {
    const audit = new AuditService(db);
    await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        audit.append({
          eventType: "test.concurrent",
          principal: { type: "SYSTEM", id: "test" },
          outcome: "APPENDED",
          metadata: { index },
          requestId: `concurrent-${index}`,
        })
      )
    );
    expect(await audit.verify()).toMatchObject({ valid: true, count: 5 });
  });
});
