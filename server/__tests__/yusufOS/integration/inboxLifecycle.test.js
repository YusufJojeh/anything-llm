const { randomUUID } = require("crypto");
const {
  createTestDatabase,
  clearYusufTables,
} = require("../../../__testUtils__/yusufOS/testDatabase");
const {
  createAgentFixture,
} = require("../../../__testUtils__/yusufOS/agentFixture");
const {
  buildAgentToolset,
  invokeCapability,
} = require("../../../domain/yusufOS/agents/toolBinding");
const { AGENT_KEYS } = require("../../../domain/yusufOS/constants");

describe("Phase P — Inbox governed lifecycle", () => {
  let testDatabase;
  let db;
  let fixture;

  beforeAll(async () => {
    testDatabase = await createTestDatabase();
    db = testDatabase.db;
  }, 120000);

  afterAll(async () => {
    if (testDatabase) await testDatabase.cleanup();
  });

  beforeEach(async () => {
    await clearYusufTables(db);
    fixture = await createAgentFixture({ db });
  });

  afterEach(() => {
    if (fixture) fixture.cleanup();
  });

  async function seedRun(agent, task) {
    const requestId = randomUUID();
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
    return {
      run,
      context: {
        requestId,
        principal: { type: "AGENT", id: agent.uuid },
        agentId: agent.id,
        taskId: task.id,
        runId: run.id,
      },
    };
  }

  async function makeTask(agent) {
    return fixture.createTask({ principal: { type: "AGENT", id: agent.uuid } });
  }

  test("recording a new message always starts at NEW with no classification", async () => {
    const task = await makeTask(fixture.inbox);
    const { context } = await seedRun(fixture.inbox, task);
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.INBOX, db });
    const receipt = await invokeCapability({
      toolset,
      capabilityKey: "inbox.record_message",
      args: {
        sender: "recruiter@example.com",
        subject: "Following up on your application",
        snippet: "We'd like to schedule an interview.",
      },
      runtimeContext: context,
    });
    expect(receipt.verificationStatus).toBe("VERIFIED");
    const result = JSON.parse(receipt.sanitizedResult);
    expect(result.status).toBe("NEW");
    const row = await db.yusuf_inbox_messages.findUnique({
      where: { uuid: result.uuid },
    });
    expect(row.classification).toBeNull();
    expect(row.status).toBe("NEW");
  });

  test("classifying a message moves it to TRIAGED and records the classification", async () => {
    const task = await makeTask(fixture.inbox);
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.INBOX, db });
    const { context: c1 } = await seedRun(fixture.inbox, task);
    const created = await invokeCapability({
      toolset,
      capabilityKey: "inbox.record_message",
      args: { sender: "hr@example.com", subject: "Interview invite" },
      runtimeContext: c1,
    });
    const { uuid } = JSON.parse(created.sanitizedResult);

    const { context: c2 } = await seedRun(fixture.inbox, task);
    const classified = await invokeCapability({
      toolset,
      capabilityKey: "inbox.classify_message",
      args: { uuid, classification: "INTERVIEW" },
      runtimeContext: c2,
    });
    expect(classified.verificationStatus).toBe("VERIFIED");
    const row = await db.yusuf_inbox_messages.findUnique({ where: { uuid } });
    expect(row.status).toBe("TRIAGED");
    expect(row.classification).toBe("INTERVIEW");
  });

  test("reclassifying an already-TRIAGED message succeeds (the one self-loop edge)", async () => {
    const task = await makeTask(fixture.inbox);
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.INBOX, db });
    const { context: c1 } = await seedRun(fixture.inbox, task);
    const created = await invokeCapability({
      toolset,
      capabilityKey: "inbox.record_message",
      args: { sender: "noreply@example.com", subject: "Delivery failed" },
      runtimeContext: c1,
    });
    const { uuid } = JSON.parse(created.sanitizedResult);
    const { context: c2 } = await seedRun(fixture.inbox, task);
    await invokeCapability({
      toolset,
      capabilityKey: "inbox.classify_message",
      args: { uuid, classification: "BOUNCE" },
      runtimeContext: c2,
    });
    const { context: c3 } = await seedRun(fixture.inbox, task);
    const reclassified = await invokeCapability({
      toolset,
      capabilityKey: "inbox.classify_message",
      args: { uuid, classification: "OTHER" },
      runtimeContext: c3,
    });
    expect(reclassified.verificationStatus).toBe("VERIFIED");
    const row = await db.yusuf_inbox_messages.findUnique({ where: { uuid } });
    expect(row.status).toBe("TRIAGED");
    expect(row.classification).toBe("OTHER");
  });

  test("preparing a reply requires prior classification and moves the message to DRAFTED", async () => {
    const task = await makeTask(fixture.inbox);
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.INBOX, db });
    const { context: c1 } = await seedRun(fixture.inbox, task);
    const created = await invokeCapability({
      toolset,
      capabilityKey: "inbox.record_message",
      args: { sender: "lead@example.com", subject: "Interested in your services" },
      runtimeContext: c1,
    });
    const { uuid } = JSON.parse(created.sanitizedResult);

    const { context: c2 } = await seedRun(fixture.inbox, task);
    await expect(
      invokeCapability({
        toolset,
        capabilityKey: "inbox.prepare_reply",
        args: { uuid, draftReplyBody: "Thanks for reaching out." },
        runtimeContext: c2,
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const { context: c3 } = await seedRun(fixture.inbox, task);
    await invokeCapability({
      toolset,
      capabilityKey: "inbox.classify_message",
      args: { uuid, classification: "OPPORTUNITY" },
      runtimeContext: c3,
    });

    const { context: c4 } = await seedRun(fixture.inbox, task);
    const drafted = await invokeCapability({
      toolset,
      capabilityKey: "inbox.prepare_reply",
      args: { uuid, draftReplyBody: "Thanks for reaching out." },
      runtimeContext: c4,
    });
    expect(drafted.verificationStatus).toBe("VERIFIED");
    const row = await db.yusuf_inbox_messages.findUnique({ where: { uuid } });
    expect(row.status).toBe("DRAFTED");
    expect(row.draftReplyBody).toBe("Thanks for reaching out.");
  });

  test("prepare_reply never creates a sent state — there is no such status in the enum", async () => {
    const task = await makeTask(fixture.inbox);
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.INBOX, db });
    for (const key of Object.keys(toolset.tools)) {
      expect(key).not.toMatch(/send|reply(?!$)|forward/i);
    }
    expect(Object.keys(toolset.tools)).not.toContain("gmail.send_reply");
  });

  test("archive_local is terminal and refuses further transitions", async () => {
    const task = await makeTask(fixture.inbox);
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.INBOX, db });
    const { context: c1 } = await seedRun(fixture.inbox, task);
    const created = await invokeCapability({
      toolset,
      capabilityKey: "inbox.record_message",
      args: { sender: "spam@example.com", subject: "You won!" },
      runtimeContext: c1,
    });
    const { uuid } = JSON.parse(created.sanitizedResult);

    const { context: c2 } = await seedRun(fixture.inbox, task);
    const archived = await invokeCapability({
      toolset,
      capabilityKey: "inbox.archive_local",
      args: { uuid },
      runtimeContext: c2,
    });
    expect(archived.verificationStatus).toBe("VERIFIED");

    const { context: c3 } = await seedRun(fixture.inbox, task);
    await expect(
      invokeCapability({
        toolset,
        capabilityKey: "inbox.classify_message",
        args: { uuid, classification: "OTHER" },
        runtimeContext: c3,
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  test("an unknown message uuid is rejected before any write", async () => {
    const task = await makeTask(fixture.inbox);
    const { context } = await seedRun(fixture.inbox, task);
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.INBOX, db });
    await expect(
      invokeCapability({
        toolset,
        capabilityKey: "inbox.classify_message",
        args: { uuid: randomUUID(), classification: "OTHER" },
        runtimeContext: context,
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(await db.yusuf_inbox_messages.count()).toBe(0);
  });

  test("linking to an unknown Career opportunity uuid is rejected before any write", async () => {
    const task = await makeTask(fixture.inbox);
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.INBOX, db });
    const { context: c1 } = await seedRun(fixture.inbox, task);
    const created = await invokeCapability({
      toolset,
      capabilityKey: "inbox.record_message",
      args: { sender: "hr@example.com", subject: "Update" },
      runtimeContext: c1,
    });
    const { uuid } = JSON.parse(created.sanitizedResult);
    const { context: c2 } = await seedRun(fixture.inbox, task);
    await expect(
      invokeCapability({
        toolset,
        capabilityKey: "inbox.classify_message",
        args: {
          uuid,
          classification: "INTERVIEW",
          linkedCareerOpportunityUuid: randomUUID(),
        },
        runtimeContext: c2,
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  test("Career integration seam: Inbox may move a linked, existing Career opportunity via inbox.advance_linked_career_status, but never create one", async () => {
    const careerTask = await makeTask(fixture.career);
    const careerToolset = buildAgentToolset({
      agentKey: AGENT_KEYS.CAREER,
      db,
    });
    const { context: careerCreateContext } = await seedRun(
      fixture.career,
      careerTask
    );
    const opportunity = await invokeCapability({
      toolset: careerToolset,
      capabilityKey: "career.record_opportunity",
      args: { company: "Acme", role: "Engineer" },
      runtimeContext: careerCreateContext,
    });
    const { uuid: opportunityUuid } = JSON.parse(opportunity.sanitizedResult);
    await db.yusuf_career_opportunities.update({ where: { uuid: opportunityUuid }, data: { status: "APPLIED" } });

    const inboxTask = await makeTask(fixture.inbox);
    const inboxToolset = buildAgentToolset({ agentKey: AGENT_KEYS.INBOX, db });
    const { context: msgContext } = await seedRun(fixture.inbox, inboxTask);
    const message = await invokeCapability({
      toolset: inboxToolset,
      capabilityKey: "inbox.record_message",
      args: { sender: "hr@acme.example.com", subject: "Interview invite" },
      runtimeContext: msgContext,
    });
    const { uuid: messageUuid } = JSON.parse(message.sanitizedResult);

    const { context: classifyContext } = await seedRun(fixture.inbox, inboxTask);
    await invokeCapability({
      toolset: inboxToolset,
      capabilityKey: "inbox.classify_message",
      args: {
        uuid: messageUuid,
        classification: "INTERVIEW",
        linkedCareerOpportunityUuid: opportunityUuid,
      },
      runtimeContext: classifyContext,
    });
    const messageRow = await db.yusuf_inbox_messages.findUnique({
      where: { uuid: messageUuid },
    });
    expect(messageRow.linkedCareerOpportunityUuid).toBe(opportunityUuid);

    // Inbox itself moves the linked opportunity forward via the narrow,
    // linkage-enforcing seam capability — no second write path, no
    // duplicate table, and no raw career.update_status grant.
    const { context: updateContext } = await seedRun(fixture.inbox, inboxTask);
    const updated = await invokeCapability({
      toolset: inboxToolset,
      capabilityKey: "inbox.advance_linked_career_status",
      args: { inboxMessageUuid: messageUuid, status: "INTERVIEWING" },
      runtimeContext: updateContext,
    });
    expect(updated.verificationStatus).toBe("VERIFIED");
    const opportunityRow = await db.yusuf_career_opportunities.findUnique({
      where: { uuid: opportunityUuid },
    });
    expect(opportunityRow.status).toBe("INTERVIEWING");

    expect(Object.keys(inboxToolset.tools)).not.toContain(
      "career.record_opportunity"
    );
    expect(Object.keys(inboxToolset.tools)).not.toContain(
      "career.update_status"
    );
    expect(await db.yusuf_career_opportunities.count()).toBe(1);
  });

  test("the seam capability has no argument to substitute a different opportunity uuid — it always resolves the target from the message's own linkage", async () => {
    const careerTask = await makeTask(fixture.career);
    const careerToolset = buildAgentToolset({
      agentKey: AGENT_KEYS.CAREER,
      db,
    });
    const { context: c1 } = await seedRun(fixture.career, careerTask);
    const oppA = await invokeCapability({
      toolset: careerToolset,
      capabilityKey: "career.record_opportunity",
      args: { company: "Acme", role: "Engineer" },
      runtimeContext: c1,
    });
    const { uuid: oppAUuid } = JSON.parse(oppA.sanitizedResult);
    await db.yusuf_career_opportunities.update({ where: { uuid: oppAUuid }, data: { status: "APPLIED" } });
    const { context: c2 } = await seedRun(fixture.career, careerTask);
    const oppB = await invokeCapability({
      toolset: careerToolset,
      capabilityKey: "career.record_opportunity",
      args: { company: "Globex", role: "Analyst" },
      runtimeContext: c2,
    });
    const { uuid: oppBUuid } = JSON.parse(oppB.sanitizedResult);

    const inboxTask = await makeTask(fixture.inbox);
    const inboxToolset = buildAgentToolset({ agentKey: AGENT_KEYS.INBOX, db });
    const { context: c3 } = await seedRun(fixture.inbox, inboxTask);
    const message = await invokeCapability({
      toolset: inboxToolset,
      capabilityKey: "inbox.record_message",
      args: { sender: "hr@acme.example.com", subject: "Interview invite" },
      runtimeContext: c3,
    });
    const { uuid: messageUuid } = JSON.parse(message.sanitizedResult);

    // Message is classified INTERVIEW and legitimately linked only to oppA.
    const { context: c4 } = await seedRun(fixture.inbox, inboxTask);
    await invokeCapability({
      toolset: inboxToolset,
      capabilityKey: "inbox.classify_message",
      args: {
        uuid: messageUuid,
        classification: "INTERVIEW",
        linkedCareerOpportunityUuid: oppAUuid,
      },
      runtimeContext: c4,
    });

    // A model attempting to advance oppB (never linked from this message)
    // through this message's seam call must be refused — the request
    // builder always resolves the target uuid from the message's own
    // linkage, so there is no argument that lets the caller substitute a
    // different opportunity.
    const { context: c5 } = await seedRun(fixture.inbox, inboxTask);
    const result = await invokeCapability({
      toolset: inboxToolset,
      capabilityKey: "inbox.advance_linked_career_status",
      args: { inboxMessageUuid: messageUuid, status: "INTERVIEWING" },
      runtimeContext: c5,
    });
    const opportunityRow = await db.yusuf_career_opportunities.findUnique({
      where: { uuid: oppAUuid },
    });
    expect(opportunityRow.status).toBe("INTERVIEWING");
    const untouchedRow = await db.yusuf_career_opportunities.findUnique({
      where: { uuid: oppBUuid },
    });
    expect(untouchedRow.status).toBe("RESEARCHING");
    expect(result.verificationStatus).toBe("VERIFIED");
  });

  test("advancing a linked opportunity is refused unless the message classification is INTERVIEW or REJECTION", async () => {
    const careerTask = await makeTask(fixture.career);
    const careerToolset = buildAgentToolset({
      agentKey: AGENT_KEYS.CAREER,
      db,
    });
    const { context: c1 } = await seedRun(fixture.career, careerTask);
    const opportunity = await invokeCapability({
      toolset: careerToolset,
      capabilityKey: "career.record_opportunity",
      args: { company: "Acme", role: "Engineer" },
      runtimeContext: c1,
    });
    const { uuid: opportunityUuid } = JSON.parse(opportunity.sanitizedResult);

    const inboxTask = await makeTask(fixture.inbox);
    const inboxToolset = buildAgentToolset({ agentKey: AGENT_KEYS.INBOX, db });
    const { context: c2 } = await seedRun(fixture.inbox, inboxTask);
    const message = await invokeCapability({
      toolset: inboxToolset,
      capabilityKey: "inbox.record_message",
      args: { sender: "hr@acme.example.com", subject: "Thanks for applying" },
      runtimeContext: c2,
    });
    const { uuid: messageUuid } = JSON.parse(message.sanitizedResult);

    const { context: c3 } = await seedRun(fixture.inbox, inboxTask);
    await invokeCapability({
      toolset: inboxToolset,
      capabilityKey: "inbox.classify_message",
      args: {
        uuid: messageUuid,
        classification: "OPPORTUNITY",
        linkedCareerOpportunityUuid: opportunityUuid,
      },
      runtimeContext: c3,
    });

    const { context: c4 } = await seedRun(fixture.inbox, inboxTask);
    await expect(
      invokeCapability({
        toolset: inboxToolset,
        capabilityKey: "inbox.advance_linked_career_status",
        args: { inboxMessageUuid: messageUuid, status: "INTERVIEWING" },
        runtimeContext: c4,
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const opportunityRow = await db.yusuf_career_opportunities.findUnique({
      where: { uuid: opportunityUuid },
    });
    expect(opportunityRow.status).toBe("RESEARCHING");
  });

  test("Inbox has no project, git, browser, or memory-write tool", async () => {
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.INBOX, db });
    for (const key of Object.keys(toolset.tools))
      expect(key.match(/^(project\.|git\.|browser\.|memory\.write)/)).toBeNull();
  });

  test("reading by status filters correctly and reading by uuid returns one row", async () => {
    const task = await makeTask(fixture.inbox);
    const toolset = buildAgentToolset({ agentKey: AGENT_KEYS.INBOX, db });
    const { context: c1 } = await seedRun(fixture.inbox, task);
    const created = await invokeCapability({
      toolset,
      capabilityKey: "inbox.record_message",
      args: { sender: "a@example.com", subject: "One" },
      runtimeContext: c1,
    });
    const { uuid } = JSON.parse(created.sanitizedResult);
    const { context: c2 } = await seedRun(fixture.inbox, task);
    await invokeCapability({
      toolset,
      capabilityKey: "inbox.record_message",
      args: { sender: "b@example.com", subject: "Two" },
      runtimeContext: c2,
    });

    const { context: readContext } = await seedRun(fixture.inbox, task);
    const byStatus = await invokeCapability({
      toolset,
      capabilityKey: "inbox.list_messages",
      args: { status: "NEW" },
      runtimeContext: readContext,
    });
    expect(JSON.parse(byStatus.sanitizedResult).items).toHaveLength(2);

    const { context: readOneContext } = await seedRun(fixture.inbox, task);
    const byUuid = await invokeCapability({
      toolset,
      capabilityKey: "inbox.read_message",
      args: { uuid },
      runtimeContext: readOneContext,
    });
    expect(JSON.parse(byUuid.sanitizedResult).uuid).toBe(uuid);
  });
});
