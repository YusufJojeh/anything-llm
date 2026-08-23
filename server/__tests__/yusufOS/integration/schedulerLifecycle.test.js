const { createTestDatabase, clearYusufTables } = require("../../../__testUtils__/yusufOS/testDatabase");
const { Scheduler, failureDelaySeconds } = require("../../../domain/yusufOS/scheduling/Scheduler");

describe("Phase Y — durable scheduler", () => {
  let testDatabase;
  let db;
  beforeAll(async () => { testDatabase = await createTestDatabase(); db = testDatabase.db; }, 120000);
  afterAll(async () => { if (testDatabase) await testDatabase.cleanup(); });
  beforeEach(async () => { await clearYusufTables(db); });

  test("claims once across concurrent ticks, persists next run, and runs only the safe retention seam", async () => {
    const now = new Date("2026-08-24T10:00:00.000Z");
    const retention = jest.fn(async () => ({ tombstonedCount: 0, errors: [] }));
    const scheduler = new Scheduler({ db, retention });
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

  test("rejects sub-minute scheduler configuration before persistence", async () => {
    const scheduler = new Scheduler({ db });
    await expect(scheduler.ensureEvidenceRetention({ intervalSeconds: 59 })).rejects.toThrow(/at least 60/i);
    expect(await db.yusuf_schedules.count()).toBe(0);
  });
});
