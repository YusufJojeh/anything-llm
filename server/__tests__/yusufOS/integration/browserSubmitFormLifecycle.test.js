const { randomUUID } = require("crypto");
const {
  createTestDatabase,
  clearYusufTables,
} = require("../../../__testUtils__/yusufOS/testDatabase");
const {
  YusufActionBoundary,
} = require("../../../domain/yusufOS/runtime/YusufActionBoundary");
const { IntentService } = require("../../../domain/yusufOS/actions/IntentService");
const { PolicyEngine } = require("../../../domain/yusufOS/policy/PolicyEngine");
const { ApprovalService } = require("../../../domain/yusufOS/approvals/ApprovalService");
const {
  ExecutionCoordinator,
} = require("../../../domain/yusufOS/execution/ExecutionCoordinator");
const { SecuritySettings } = require("../../../domain/yusufOS/security/SecuritySettings");
const { BrowserAdapter } = require("../../../domain/yusufOS/adapters/browser/BrowserAdapter");
const {
  FixtureBrowserDriver,
} = require("../../../domain/yusufOS/adapters/browser/drivers/FixtureBrowserDriver");
const {
  buildSubmitFormRequest,
} = require("../../../domain/yusufOS/adapters/browser/requestBuilders");
const {
  __setRegistryForTests,
} = require("../../../domain/yusufOS/adapters/browser/formRegistry");
const {
  ENV_ENABLED,
  ENV_ALLOWLIST,
} = require("../../../domain/yusufOS/adapters/browser/originPolicy");

/**
 * Phase I — the first governed browser mutation, `browser.submit_form`.
 *
 * Mirrors the discipline `localGitPushLifecycle.test.js` established for
 * `git.push_feature_branch`: approval must be consumed before any effect,
 * wrong-account and page-drift must invalidate rather than proceed, an
 * uncertain outcome must resolve to FAILED_UNKNOWN → reconcile rather than a
 * blind retry, and nothing here trusts a single read.
 */

const ORIGIN = "https://example.test";
const FORM_URL = `${ORIGIN}/contact`;
const THANKS_URL = `${ORIGIN}/contact/thanks`;
const OTHER_PATH_URL = `${ORIGIN}/other`;

const FORM_KEY = "test.contact_form";

function seedRegistry() {
  __setRegistryForTests({
    [FORM_KEY]: {
      formKey: FORM_KEY,
      origin: ORIGIN,
      pathPattern: /^\/contact$/,
      submitSelector: "#submit",
      fields: {
        message: { selector: "#message", maxLength: 500, required: true },
      },
      verification: { kind: "URL_PATTERN", pattern: /\/contact\/thanks$/ },
      description: "Test-only contact form.",
    },
  });
}

function fixtureDriver({ accountLabel = "yusuf", verifiedBySession = true } = {}) {
  return new FixtureBrowserDriver({
    tabs: [{ tabId: "tab-1", url: FORM_URL, title: "Contact" }],
    pages: {
      [FORM_URL]: { title: "Contact", visibleText: "Contact us" },
      [THANKS_URL]: { title: "Thanks", visibleText: "Thanks for your message" },
      [OTHER_PATH_URL]: { title: "Other", visibleText: "unrelated page" },
    },
    identities: {
      [FORM_URL]: { state: "authenticated", accountLabel, verifiedBySession },
    },
    submitPlans: {
      "tab-1": { resultUrl: THANKS_URL },
    },
  });
}

describe("browser.submit_form — the first governed browser mutation", () => {
  let testDatabase;
  let db;

  beforeAll(async () => {
    testDatabase = await createTestDatabase();
    db = testDatabase.db;
  }, 120000);

  afterAll(async () => {
    if (testDatabase) await testDatabase.cleanup();
  });

  beforeEach(async () => {
    await clearYusufTables(db);
    seedRegistry();
    process.env[ENV_ENABLED] = "true";
    process.env[ENV_ALLOWLIST] = ORIGIN;
  });

  afterAll(() => {
    __setRegistryForTests(null);
    delete process.env[ENV_ENABLED];
    delete process.env[ENV_ALLOWLIST];
  });

  async function seedAgentTaskRun(capabilityKey) {
    const requestId = randomUUID();
    const agent = await db.yusuf_agents.create({
      data: {
        uuid: randomUUID(),
        key: `agent-${randomUUID()}`,
        name: "Phase I Test Agent",
        mission: "Prove the governed browser mutation vertical slice.",
        instructions: "Use only governed browser capabilities.",
        status: "ACTIVE",
      },
    });
    const task = await db.yusuf_tasks.create({
      data: {
        uuid: randomUUID(),
        assignedAgentId: agent.id,
        requestedByPrincipalType: "AGENT",
        requestedByPrincipalId: agent.uuid,
        title: "Phase I submit-form test",
        objective: "Exercise a governed browser.submit_form intent.",
        status: "RUNNING",
        requestId,
      },
    });
    const run = await db.yusuf_agent_runs.create({
      data: {
        uuid: randomUUID(),
        taskId: task.id,
        agentId: agent.id,
        requestedByPrincipalType: "AGENT",
        requestedByPrincipalId: agent.uuid,
        status: "RUNNING",
        requestId,
      },
    });
    await db.yusuf_agent_capabilities.create({
      data: { agentId: agent.id, capabilityKey, capabilityVersion: 1 },
    });
    return { agent, task, run, requestId };
  }

  function makeBoundary(adapter) {
    return new YusufActionBoundary({
      intentService: new IntentService(db),
      policyEngine: new PolicyEngine(db),
      executionCoordinatorFactory: () => new ExecutionCoordinator({ db, adapter }),
    });
  }

  async function dispatchSubmit(adapter, driver, seeded, { fields = { message: "hello" } } = {}) {
    const boundary = makeBoundary(adapter);
    const tool = boundary.bindTool({
      name: "browser-submit-form",
      capability: "browser.submit_form",
      buildActionRequest: () =>
        buildSubmitFormRequest({ formKey: FORM_KEY, tabId: "tab-1", fields }, db, { driver }),
    });
    return boundary.dispatch({
      functionConfig: tool,
      arguments: {},
      runtimeContext: {
        requestId: seeded.requestId,
        principal: { type: "AGENT", id: seeded.agent.uuid },
        agentId: seeded.agent.id,
        taskId: seeded.task.id,
        runId: seeded.run.id,
      },
    });
  }

  async function approve(intentUuid, principal = { type: "USER", id: "yusuf" }) {
    const intent = await db.yusuf_action_intents.findUnique({ where: { uuid: intentUuid } });
    const approval = await db.yusuf_approval_requests.findUnique({ where: { intentId: intent.id } });
    await new ApprovalService(db).decide(approval.id, {
      decision: "APPROVE",
      expectedPayloadHash: approval.payloadHash,
      expectedIntentVersion: intent.version,
      expectedApprovalVersion: approval.version,
      principal,
    });
    return intent.id;
  }

  test("submission waits for durable approval and the driver is never called before it", async () => {
    const driver = fixtureDriver();
    const adapter = new BrowserAdapter({ driver });
    const seeded = await seedAgentTaskRun("browser.submit_form");
    const dispatched = await dispatchSubmit(adapter, driver, seeded);
    expect(dispatched.state).toBe("WAITING_APPROVAL");
    expect(driver.submitCount).toBe(0);
  });

  test("an approved submission succeeds and an independent re-read verifies it", async () => {
    const driver = fixtureDriver();
    const adapter = new BrowserAdapter({ driver });
    const seeded = await seedAgentTaskRun("browser.submit_form");
    const dispatched = await dispatchSubmit(adapter, driver, seeded);
    const numericId = await approve(dispatched.intentId);

    const receipt = await new ExecutionCoordinator({ db, adapter }).execute(numericId);
    expect(receipt).toMatchObject({ outcome: "SUCCEEDED", verificationStatus: "VERIFIED" });
    expect(driver.submitCount).toBe(1);
  });

  test("an unregistered form key is refused, not improvised", async () => {
    const driver = fixtureDriver();
    await expect(
      buildSubmitFormRequest({ formKey: "no.such.form", tabId: "tab-1", fields: {} }, db, { driver })
    ).rejects.toMatchObject({ code: "ACTION_FORBIDDEN", details: { reason: "UNREGISTERED_FORM" } });
  });

  test("a field the descriptor does not name is rejected before any intent exists", async () => {
    const driver = fixtureDriver();
    await expect(
      buildSubmitFormRequest(
        { formKey: FORM_KEY, tabId: "tab-1", fields: { message: "hi", extra: "smuggled" } },
        db,
        { driver }
      )
    ).rejects.toMatchObject({ code: "ACTION_FORBIDDEN", details: { reason: "FIELD_NOT_ALLOWED" } });
    expect(await db.yusuf_action_intents.count()).toBe(0);
  });

  test("a missing required field is rejected", async () => {
    const driver = fixtureDriver();
    await expect(
      buildSubmitFormRequest({ formKey: FORM_KEY, tabId: "tab-1", fields: {} }, db, { driver })
    ).rejects.toMatchObject({ code: "ACTION_FORBIDDEN", details: { reason: "FIELD_REQUIRED" } });
  });

  test("an identity the page merely claims (not session-verified) never satisfies the account check", async () => {
    const driver = fixtureDriver({ verifiedBySession: false });
    await expect(
      buildSubmitFormRequest({ formKey: FORM_KEY, tabId: "tab-1", fields: { message: "hi" } }, db, {
        driver,
      })
    ).rejects.toMatchObject({ code: "ACTION_FORBIDDEN", details: { reason: "ACCOUNT_UNVERIFIED" } });
  });

  test("an account switch after approval invalidates it; the form is never submitted", async () => {
    const driver = fixtureDriver({ accountLabel: "yusuf" });
    const adapter = new BrowserAdapter({ driver });
    const seeded = await seedAgentTaskRun("browser.submit_form");
    const dispatched = await dispatchSubmit(adapter, driver, seeded);
    const numericId = await approve(dispatched.intentId);

    // The operator switches accounts on the same tab/origin before execution.
    driver.identities[FORM_URL] = {
      state: "authenticated",
      accountLabel: "someone-else",
      verifiedBySession: true,
    };

    await expect(new ExecutionCoordinator({ db, adapter }).execute(numericId)).rejects.toMatchObject({
      code: "APPROVAL_INVALIDATED",
      details: { reason: "ACCOUNT_CHANGED" },
    });
    expect(driver.submitCount).toBe(0);
  });

  test("the page changing after approval invalidates it (content drift)", async () => {
    const driver = fixtureDriver();
    const adapter = new BrowserAdapter({ driver });
    const seeded = await seedAgentTaskRun("browser.submit_form");
    const dispatched = await dispatchSubmit(adapter, driver, seeded);
    const numericId = await approve(dispatched.intentId);

    driver.pages[FORM_URL] = { title: "Contact", visibleText: "This page changed underneath you." };

    await expect(new ExecutionCoordinator({ db, adapter }).execute(numericId)).rejects.toMatchObject({
      code: "APPROVAL_INVALIDATED",
      details: { reason: "RESOURCE_CHANGED" },
    });
    expect(driver.submitCount).toBe(0);
  });

  test("navigating off the form's page after approval refuses execution outright", async () => {
    const driver = fixtureDriver();
    const adapter = new BrowserAdapter({ driver });
    const seeded = await seedAgentTaskRun("browser.submit_form");
    const dispatched = await dispatchSubmit(adapter, driver, seeded);
    const numericId = await approve(dispatched.intentId);

    driver.tabs = driver.tabs.map((tab) =>
      tab.tabId === "tab-1" ? { ...tab, url: OTHER_PATH_URL } : tab
    );

    await expect(new ExecutionCoordinator({ db, adapter }).execute(numericId)).rejects.toMatchObject({
      code: "ACTION_FORBIDDEN",
      details: { reason: "PATH_MISMATCH" },
    });
    expect(driver.submitCount).toBe(0);
  });

  test("a submitted form cannot be executed a second time (server-owned idempotency)", async () => {
    const driver = fixtureDriver();
    const adapter = new BrowserAdapter({ driver });
    const seeded = await seedAgentTaskRun("browser.submit_form");
    const dispatched = await dispatchSubmit(adapter, driver, seeded);
    const numericId = await approve(dispatched.intentId);
    const coordinator = new ExecutionCoordinator({ db, adapter });
    await coordinator.execute(numericId);
    await expect(coordinator.execute(numericId)).resolves.toMatchObject({
      verificationStatus: "VERIFIED",
    });
    expect(driver.submitCount).toBe(1);
  });

  test("an uncertain submission outcome becomes FAILED_UNKNOWN, blocks blind retry, and reconciliation confirms the real effect", async () => {
    const driver = fixtureDriver();
    class UncertainOnceAdapter extends BrowserAdapter {
      async execute(prepared) {
        const result = await super.execute(prepared);
        throw Object.assign(
          new Error("Simulated: the submission completed but the outcome could not be confirmed."),
          { effectCertain: false }
        );
      }
    }
    const adapter = new UncertainOnceAdapter({ driver });
    const seeded = await seedAgentTaskRun("browser.submit_form");
    const dispatched = await dispatchSubmit(adapter, driver, seeded);
    const numericId = await approve(dispatched.intentId);

    const coordinator = new ExecutionCoordinator({ db, adapter });
    const receipt = await coordinator.execute(numericId);
    expect(receipt).toMatchObject({ outcome: "UNKNOWN", verificationStatus: "UNKNOWN" });

    await expect(coordinator.execute(numericId)).rejects.toMatchObject({ code: "EXECUTION_UNKNOWN" });

    const reconciled = await coordinator.reconcile(numericId);
    expect(reconciled).toMatchObject({ outcome: "SUCCEEDED", verificationStatus: "VERIFIED" });
  });

  test("a submission that never landed reconciles to a genuine failure, not a fabricated success", async () => {
    const driver = fixtureDriver();
    driver.submitPlans["tab-1"] = { error: { certain: false, message: "connection dropped" } };
    const adapter = new BrowserAdapter({ driver });
    const seeded = await seedAgentTaskRun("browser.submit_form");
    const dispatched = await dispatchSubmit(adapter, driver, seeded);
    const numericId = await approve(dispatched.intentId);

    const coordinator = new ExecutionCoordinator({ db, adapter });
    const receipt = await coordinator.execute(numericId);
    expect(receipt.outcome).toBe("UNKNOWN");

    const reconciled = await coordinator.reconcile(numericId);
    // The page never actually moved to the thanks URL, so the independent
    // re-check must report NOT_APPLIED — never VERIFIED just because a retry
    // would be convenient.
    expect(reconciled).toMatchObject({ outcome: "FAILED", verificationStatus: "NOT_APPLIED" });
  });

  test("the kill switch blocks an already-approved submission without consuming the approval", async () => {
    const driver = fixtureDriver();
    const adapter = new BrowserAdapter({ driver });
    const seeded = await seedAgentTaskRun("browser.submit_form");
    const dispatched = await dispatchSubmit(adapter, driver, seeded);
    const numericId = await approve(dispatched.intentId);

    await new SecuritySettings(db).setExternalMutationsDisabled(true, {
      principal: { type: "USER", id: "yusuf" },
      requestId: seeded.requestId,
    });
    await expect(new ExecutionCoordinator({ db, adapter }).execute(numericId)).rejects.toMatchObject({
      code: "MUTATIONS_DISABLED",
    });
    const approvalRow = await db.yusuf_approval_requests.findUnique({ where: { intentId: numericId } });
    expect(approvalRow.status).toBe("APPROVED");
    expect(driver.submitCount).toBe(0);
  });

  test("a disabled broker refuses to build or execute a submission", async () => {
    process.env[ENV_ENABLED] = "false";
    const driver = fixtureDriver();
    await expect(
      buildSubmitFormRequest({ formKey: FORM_KEY, tabId: "tab-1", fields: { message: "hi" } }, db, {
        driver,
      })
    ).rejects.toThrow(/not observable|disabled/i);
  });
});
