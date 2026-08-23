const { randomUUID } = require("crypto");
const prisma = require("../../../utils/prisma");
const { tombstoneExpiredEvidence } = require("../evidence/EvidenceRetention");
const {
  NotificationService,
  NOTIFICATION_KINDS,
} = require("../notifications/NotificationService");

const SCHEDULE_KINDS = Object.freeze({
  EVIDENCE_RETENTION: "EVIDENCE_RETENTION",
});
const DEFAULT_INTERVAL_SECONDS = 3600;
const LEASE_MS = 60 * 1000;
const MAX_FAILURE_BACKOFF_SECONDS = 24 * 60 * 60;

function failureDelaySeconds(failureCount) {
  return Math.min(
    DEFAULT_INTERVAL_SECONDS * 2 ** Math.max(0, failureCount - 1),
    MAX_FAILURE_BACKOFF_SECONDS
  );
}

class Scheduler {
  constructor({
    db = prisma,
    retention = tombstoneExpiredEvidence,
    notifications,
  } = {}) {
    this.db = db;
    this.retention = retention;
    this.notifications = notifications || new NotificationService(db);
  }

  async ensureEvidenceRetention({
    now = new Date(),
    intervalSeconds = DEFAULT_INTERVAL_SECONDS,
  } = {}) {
    if (!Number.isInteger(intervalSeconds) || intervalSeconds < 60)
      throw new Error(
        "Scheduler interval must be a whole number of at least 60 seconds."
      );
    return this.db.yusuf_schedules.upsert({
      where: { scheduleKey: SCHEDULE_KINDS.EVIDENCE_RETENTION },
      create: {
        uuid: randomUUID(),
        scheduleKey: SCHEDULE_KINDS.EVIDENCE_RETENTION,
        kind: SCHEDULE_KINDS.EVIDENCE_RETENTION,
        intervalSeconds,
        nextRunAt: now,
      },
      update: {},
    });
  }

  async tick({ now = new Date() } = {}) {
    const due = await this.db.yusuf_schedules.findMany({
      where: { status: "ACTIVE", nextRunAt: { lte: now } },
      orderBy: { nextRunAt: "asc" },
      take: 20,
    });
    const results = [];
    for (const schedule of due) results.push(await this.#runOne(schedule, now));
    return results;
  }

  async #runOne(schedule, now) {
    const leaseId = randomUUID();
    const claimed = await this.db.yusuf_schedules.updateMany({
      where: {
        id: schedule.id,
        status: "ACTIVE",
        version: schedule.version,
        nextRunAt: { lte: now },
        OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
      },
      data: {
        leaseId,
        leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
        version: { increment: 1 },
      },
    });
    if (claimed.count !== 1)
      return { scheduleKey: schedule.scheduleKey, status: "SKIPPED" };
    try {
      if (schedule.kind !== SCHEDULE_KINDS.EVIDENCE_RETENTION)
        throw new Error("UNKNOWN_SCHEDULE_KIND");
      const result = await this.retention(this.db, { now });
      const completed = await this.db.yusuf_schedules.updateMany({
        where: { id: schedule.id, leaseId },
        data: {
          lastRunAt: now,
          nextRunAt: new Date(now.getTime() + schedule.intervalSeconds * 1000),
          failureCount: 0,
          lastErrorCode: null,
          leaseId: null,
          leaseExpiresAt: null,
          version: { increment: 1 },
        },
      });
      if (completed.count !== 1) throw new Error("SCHEDULE_LEASE_LOST");
      return { scheduleKey: schedule.scheduleKey, status: "SUCCEEDED", result };
    } catch {
      const failureCount = schedule.failureCount + 1;
      await this.db.yusuf_schedules.updateMany({
        where: { id: schedule.id, leaseId },
        data: {
          failureCount,
          lastErrorCode: "SCHEDULE_EXECUTION_FAILED",
          nextRunAt: new Date(
            now.getTime() + failureDelaySeconds(failureCount) * 1000
          ),
          leaseId: null,
          leaseExpiresAt: null,
          version: { increment: 1 },
        },
      });
      await this.notifications.open({
        kind: NOTIFICATION_KINDS.SCHEDULER_FAILURE,
        dedupeKey: `scheduler:${schedule.scheduleKey}`,
        summary: `Scheduled ${schedule.scheduleKey} failed; retry is pending.`,
      });
      return { scheduleKey: schedule.scheduleKey, status: "FAILED" };
    }
  }
}

module.exports = {
  Scheduler,
  SCHEDULE_KINDS,
  failureDelaySeconds,
  DEFAULT_INTERVAL_SECONDS,
};
