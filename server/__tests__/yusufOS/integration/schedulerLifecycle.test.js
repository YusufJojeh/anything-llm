const { createTestDatabase, clearYusufTables } = require("../../../__testUtils__/yusufOS/testDatabase");
const { Scheduler, failureDelaySeconds } = require("../../../domain/yusufOS/scheduling/Scheduler");
const { SchedulerWorker } = require("../../../domain/yusufOS/scheduling/SchedulerWorker");
const { NotificationService } = require("../../../domain/yusufOS/notifications/NotificationService");
const { NotificationProjector } = require("../../../domain/yusufOS/notifications/NotificationProjector");

describe("Phase Y — durable scheduler", () => {
  let testDatabase;
  let db;
  beforeAll(async () => { testDatabase = await createTestDatabase(); db = testDatabase.db; }, 120000);
  afterAll(async () => { if (testDatabase) await testDatabase.cleanup(); });
  beforeEach(async () => { await clearYusufTables(db); });

  test("claims once across concurrent ticks, persists next run, and runs only the safe retention seam", async () => {
    const now = new Date("2026-08-24T10:00:00.000Z");
    const retention = jest.fn(async () => ({ tombstonedCount: 0, errors: [] }));
    const scheduler = new Scheduler({ db, retention, random: () => 0.5 });
    await scheduler.ensureEvidenceRetention({ now, intervalSeconds: 60 });
    const results = await Promise.all([scheduler.tick({ now }), scheduler.tick({ now })]);
    expect(retention).toHaveBeenCalledTimes(1);
    expect(results.flat().map((item) => item.status)).toEqual(
      expect.arrayContaining(["SUCCEEDED"])
    );
    expect(await db.yusuf_schedules.findUnique({ where: { scheduleKey: "EVIDENCE_RETENTION" } })).toMatchObject({ failureCount: 0, leaseId: null, nextRunAt: new Date("2026-08-24T10:01:00.000Z") });
  });

  test("failure backs off durably and emits one deduplicated operator notification", async () => {
    const now = new Date("2026-08-24T10:00:00.000Z");
    const scheduler = new Scheduler({ db, retention: async () => { throw new Error("disk unavailable"); } });
    await scheduler.ensureEvidenceRetention({ now });
    expect(await scheduler.tick({ now })).toEqual([{ scheduleKey: "EVIDENCE_RETENTION", status: "FAILED" }]);
    expect(failureDelaySeconds(1)).toBe(3600);
    expect(await db.yusuf_schedules.findUnique({ where: { scheduleKey: "EVIDENCE_RETENTION" } })).toMatchObject({ failureCount: 1, lastErrorCode: "SCHEDULE_EXECUTION_FAILED", leaseId: null });
    expect(await db.yusuf_notifications.findMany()).toEqual([expect.objectContaining({ kind: "SCHEDULER_FAILURE", status: "OPEN", dedupeKey: "scheduler:EVIDENCE_RETENTION" })]);
  });

  test("retention row errors are retried and surfaced instead of being recorded as success", async () => {
    const now = new Date("2026-08-24T10:00:00.000Z");
    const scheduler = new Scheduler({
      db,
      retention: async () => ({ errors: [{ uuid: "evidence-1" }] }),
    });
    await scheduler.ensureEvidenceRetention({ now });
    expect(await scheduler.tick({ now })).toEqual([
      { scheduleKey: "EVIDENCE_RETENTION", status: "FAILED" },
    ]);
    expect(await db.yusuf_schedules.findUnique({ where: { scheduleKey: "EVIDENCE_RETENTION" } })).toMatchObject({ failureCount: 1, lastErrorCode: "SCHEDULE_EXECUTION_FAILED" });
    expect(await db.yusuf_audit_events.findFirst({ where: { eventType: "scheduler.failed" } })).toBeTruthy();
  });

  test("recovers an expired worker lease and lets an operator acknowledge the durable alert", async () => {
    const now = new Date("2026-08-24T10:00:00.000Z");
    const scheduler = new Scheduler({ db, retention: async () => ({ tombstonedCount: 0, errors: [] }) });
    const schedule = await scheduler.ensureEvidenceRetention({ now });
    await db.yusuf_schedules.update({ where: { id: schedule.id }, data: { leaseId: "crashed-worker", leaseExpiresAt: new Date(now.getTime() - 1) } });
    expect(await scheduler.tick({ now })).toEqual([expect.objectContaining({ status: "SUCCEEDED" })]);
    await db.yusuf_schedules.update({ where: { id: schedule.id }, data: { nextRunAt: now } });
    const failed = new Scheduler({ db, retention: async () => { throw new Error("failure"); } });
    await failed.tick({ now });
    const notice = await db.yusuf_notifications.findFirst();
    expect(await failed.notifications.acknowledge(notice.uuid, { now })).toBe(true);
    expect(await db.yusuf_notifications.findUnique({ where: { uuid: notice.uuid } })).toMatchObject({ status: "ACKNOWLEDGED", acknowledgedAt: now });
  });

  test("does not reopen an acknowledged notification or append duplicate open evidence", async () => {
    const notifications = new NotificationService(db);
    const first = await notifications.open({
      kind: "TASK_BLOCKED", dedupeKey: "task-blocked:stable", summary: "Task is blocked.",
    });
    expect(await notifications.acknowledge(first.uuid)).toBe(true);
    const repeated = await notifications.open({
      kind: "TASK_BLOCKED", dedupeKey: "task-blocked:stable", summary: "Changed projection copy.",
    });
    expect(repeated.uuid).toBe(first.uuid);
    expect(await db.yusuf_notifications.findUnique({ where: { uuid: first.uuid } })).toMatchObject({
      status: "ACKNOWLEDGED", summary: "Task is blocked.",
    });
    expect(await db.yusuf_audit_events.count({ where: { eventType: "notification.opened" } })).toBe(1);
  });

  test("resolves cleared incidents and reopens a later recurrence with new audit evidence", async () => {
    const notifications = new NotificationService(db);
    const first = await notifications.open({
      kind: "TASK_BLOCKED", dedupeKey: "task-blocked:recurs", summary: "Task is blocked.",
    });
    await notifications.acknowledge(first.uuid);
    expect(await notifications.resolve("task-blocked:recurs")).toBe(true);
    expect(await db.yusuf_notifications.findUnique({ where: { uuid: first.uuid } })).toMatchObject({ status: "RESOLVED" });
    const recurrence = await notifications.open({
      kind: "TASK_BLOCKED", dedupeKey: "task-blocked:recurs", summary: "Task is blocked again.",
    });
    expect(recurrence).toMatchObject({ uuid: first.uuid, status: "OPEN", acknowledgedAt: null, summary: "Task is blocked again." });
    expect(await db.yusuf_audit_events.count({ where: { eventType: "notification.reopened" } })).toBe(1);
  });

  test("fails closed when the terminal scheduler audit cannot be persisted", async () => {
    const now = new Date("2026-08-24T10:00:00.000Z");
    const audit = { appendInTransaction: jest.fn(async () => { throw new Error("audit unavailable"); }) };
    const scheduler = new Scheduler({
      db, audit, retention: async () => ({ tombstonedCount: 0, errors: [] }),
    });
    await scheduler.ensureEvidenceRetention({ now });
    expect(await scheduler.tick({ now })).toEqual([
      { scheduleKey: "EVIDENCE_RETENTION", status: "FAILED" },
    ]);
    const persisted = await db.yusuf_schedules.findUnique({ where: { scheduleKey: "EVIDENCE_RETENTION" } });
    expect(persisted.lastRunAt).toBeNull();
    expect(persisted.leaseId).toBeTruthy();
    expect(await db.yusuf_audit_events.count({ where: { eventType: "scheduler.succeeded" } })).toBe(0);
  });

  test("projects actual offline adapters while ignoring a deliberately disabled browser broker", async () => {
    const previous = process.env.YUSUF_OS_BROWSER_BROKER_ENABLED;
    process.env.YUSUF_OS_BROWSER_BROKER_ENABLED = "true";
    try {
      const projector = new NotificationProjector({
        db,
        browserAdapter: { availability: async () => ({ status: "UNAVAILABLE" }) },
        localGitAdapter: { availability: async () => { throw new Error("git missing"); } },
      });
      await projector.refresh();
      expect(await db.yusuf_notifications.findMany({ orderBy: { kind: "asc" } })).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: "ADAPTER_OFFLINE", dedupeKey: "adapter:local-git" }),
          expect.objectContaining({ kind: "BROWSER_DISCONNECTED", dedupeKey: "adapter:browser-broker" }),
        ])
      );
    } finally {
      if (previous === undefined) delete process.env.YUSUF_OS_BROWSER_BROKER_ENABLED;
      else process.env.YUSUF_OS_BROWSER_BROKER_ENABLED = previous;
    }
  });

  test("rejects sub-minute scheduler configuration before persistence", async () => {
    const scheduler = new Scheduler({ db });
    await expect(scheduler.ensureEvidenceRetention({ intervalSeconds: 59 })).rejects.toThrow(/at least 60/i);
    expect(await db.yusuf_schedules.count()).toBe(0);
  });

  test("boot worker seeds and ticks the durable scheduler without overlapping work", async () => {
    const scheduler = {
      ensureEvidenceRetention: jest.fn(async () => {}),
      tick: jest.fn(async () => []),
    };
    const worker = new SchedulerWorker({ scheduler, pollMs: 1000 });
    await worker.start();
    expect(scheduler.ensureEvidenceRetention).toHaveBeenCalledTimes(1);
    expect(scheduler.tick).toHaveBeenCalledTimes(1);
    worker.stop();
  });

  test("worker persists a heartbeat after a successful boot tick", async () => {
    const scheduler = new Scheduler({
      db,
      retention: async () => ({ tombstonedCount: 0, errors: [] }),
    });
    const worker = new SchedulerWorker({ scheduler, pollMs: 1000 });
    await worker.start();
    const schedule = await db.yusuf_schedules.findUnique({
      where: { scheduleKey: "EVIDENCE_RETENTION" },
    });
    expect(schedule.workerLastTickAt).toBeTruthy();
    expect(schedule.workerLastErrorCode).toBeNull();
    worker.stop();
  });

  test("worker keeps retrying and records a bootstrap/tick failure instead of disappearing", async () => {
    const seed = new Scheduler({ db });
    await seed.ensureEvidenceRetention();
    const scheduler = {
      db,
      ensureEvidenceRetention: jest.fn(async () => {}),
      tick: jest.fn(async () => {
        throw new Error("database temporarily unavailable");
      }),
    };
    const worker = new SchedulerWorker({ scheduler, pollMs: 1000 });
    await worker.start();
    const schedule = await db.yusuf_schedules.findUnique({
      where: { scheduleKey: "EVIDENCE_RETENTION" },
    });
    expect(schedule.workerLastFailureAt).toBeTruthy();
    expect(schedule.workerLastErrorCode).toBe("SCHEDULER_WORKER_FAILED");
    expect(worker.timer).toBeTruthy();
    worker.stop();
  });
});
