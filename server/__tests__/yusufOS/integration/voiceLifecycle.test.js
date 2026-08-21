const {
  createTestDatabase,
  clearYusufTables,
} = require("../../../__testUtils__/yusufOS/testDatabase");
const {
  AgentReasoningLoop,
} = require("../../../domain/yusufOS/agents/AgentReasoningLoop");
const {
  DeterministicModelClient,
} = require("../../../domain/yusufOS/agents/ModelClient");
const {
  VoiceService,
} = require("../../../domain/yusufOS/voice/VoiceService");
const {
  IntentService,
} = require("../../../domain/yusufOS/actions/IntentService");
const { PolicyEngine } = require("../../../domain/yusufOS/policy/PolicyEngine");

describe("Phase U — voice command lifecycle", () => {
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
  });

  test("a spoken request traverses Chief handoff and the governed action boundary", async () => {
    const model = new DeterministicModelClient({
      "chief_of_staff:reasoning": {
        type: "HANDOFF",
        targetAgent: "career",
        reason: "Career owns opportunity tracking.",
      },
      "career:reasoning": [
        {
          type: "CALL_CAPABILITY",
          capability: "career.record_opportunity",
          arguments: { company: "Acme", role: "Backend Engineer" },
          reason: "Record the requested role.",
          expectedOutcome: "A researching opportunity.",
        },
        {
          type: "COMPLETE",
          summary: "The Acme backend role was recorded.",
          evidenceRefs: [],
        },
      ],
    });
    const transcribe = jest
      .fn()
      .mockResolvedValue("Record Acme's backend engineer role");
    const ttsBuffer = jest.fn().mockResolvedValue(Buffer.from("spoken reply"));
    const service = new VoiceService({
      db,
      env: {
        STT_PROVIDER: "lemonade",
        STT_LEMONADE_BASE_PATH: "http://localhost:8000",
        TTS_PROVIDER: "kokoro",
        TTS_KOKORO_ENDPOINT: "http://localhost:8880/v1",
      },
      sttFactory: () => ({ transcribe }),
      ttsFactory: () => ({ ttsBuffer }),
      reasoningLoop: new AgentReasoningLoop({ db, modelClient: model }),
    });

    const utterance = await service.transcribe(
      Buffer.from("bounded audio fixture"),
      "fixture.webm"
    );
    const result = await service.command({
        utterance,
        principal: { type: "USER", id: "yusuf" },
        requestId: "voice-lifecycle-test",
      });
    expect(result).toMatchObject({
      state: "COMPLETED",
      response: "The Acme backend role was recorded.",
      approvalId: null,
    });
    await expect(service.speak(result.response)).resolves.toEqual(
      Buffer.from("spoken reply")
    );

    expect(transcribe).toHaveBeenCalledTimes(1);
    expect(ttsBuffer).toHaveBeenCalledWith(result.response, {
      signal: expect.any(AbortSignal),
      timeoutMs: 30000,
    });
    expect(await db.yusuf_tasks.count()).toBe(1);
    expect(await db.yusuf_agent_runs.count()).toBe(2);
    expect(await db.yusuf_handoffs.count()).toBe(1);
    expect(await db.yusuf_action_intents.count()).toBe(1);
    expect(await db.yusuf_career_opportunities.count()).toBe(1);
    expect(await db.yusuf_approval_requests.count()).toBe(0);
  });

  test("a spoken L3 request creates an exact pending approval and never executes", async () => {
    const reasoningLoop = {
      execute: jest.fn(async ({ runId, requestId }) => {
        const run = await db.yusuf_agent_runs.findUnique({
          where: { id: runId },
          include: { agent: true },
        });
        await db.yusuf_agent_capabilities.create({
          data: {
            agentId: run.agentId,
            capabilityKey: "core.external_mutation",
            capabilityVersion: 1,
          },
        });
        const intent = await new IntentService(db).create(
          {
            principal: { type: "AGENT", id: run.agent.uuid },
            agentId: run.agentId,
            taskId: run.taskId,
            runId: run.id,
            capability: "core.external_mutation",
            resource: { type: "JOB_APPLICATION", id: "job-1", version: "v1" },
            target: { account: "fixture-only" },
            environment: "TEST",
            payload: { action: "apply" },
          },
          { requestId }
        );
        await new PolicyEngine(db).evaluate(intent.id, { requestId });
        return {
          outcome: "WAITING_APPROVAL",
          runId: run.uuid,
          reason: "Approval is required.",
        };
      }),
    };
    const service = new VoiceService({ db, reasoningLoop });
    const result = await service.command({
      utterance: "Apply to this job",
      principal: { type: "USER", id: "yusuf" },
      requestId: "voice-l3-test",
    });

    expect(result).toMatchObject({
      state: "APPROVAL_REQUIRED",
      response: "Approval is required.",
      approvalId: expect.any(String),
    });
    expect(await db.yusuf_action_intents.count()).toBe(1);
    expect(await db.yusuf_approval_requests.count()).toBe(1);
    expect(await db.yusuf_action_receipts.count()).toBe(0);
  });

  test("an approval wait without a durable approval fails instead of looking ready", async () => {
    const service = new VoiceService({
      db,
      reasoningLoop: {
        execute: jest.fn().mockResolvedValue({
          outcome: "WAITING_APPROVAL",
          runId: "missing-approval-run",
          reason: "Approval is required.",
        }),
      },
    });
    await expect(
      service.command({
        utterance: "Apply without a durable approval",
        principal: { type: "USER", id: "yusuf" },
        requestId: "voice-missing-approval-test",
      })
    ).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
  });
});
