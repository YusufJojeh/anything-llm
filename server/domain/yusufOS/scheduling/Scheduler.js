const { randomUUID } = require("crypto");
const prisma = require("../../../utils/prisma");
const { tombstoneExpiredEvidence } = require("../evidence/EvidenceRetention");
const { AuditService } = require("../audit/AuditService");
const { PRINCIPAL_TYPES } = require("../constants");
const {
  NotificationService,
  NOTIFICATION_KINDS,
} = require("../notifications/NotificationService");
const {
  NotificationProjector,
} = require("../notifications/NotificationProjector");

const SCHEDULE_KINDS = Object.freeze({
  EVIDENCE_RETENTION: "EVIDENCE_RETENTION",
});
const DEFAULT_INTERVAL_SECONDS = 3600;
const LEASE_MS = 60 * 1000;
const MAX_FAILURE_BACKOFF_SECONDS = 24 * 60 * 60;
const JITTER_FRACTION = 0.1;

function failureDelaySeconds(failureCount) {
  return Math.min(
    DEFAULT_INTERVAL_SECONDS * 2 ** Math.max(0, failureCount - 1),
    MAX_FAILURE_BACKOFF_SECONDS
  );
}

function nextCoalescedRunAt(now, intervalSeconds, random = Math.random) {
  const jitterSeconds = Math.floor(
    (random() * 2 - 1) * intervalSeconds * JITTER_FRACTION
  );
  return new Date(now.getTime() + (intervalSeconds + jitterSeconds) * 1000);
}

class Scheduler {
  constructor({
    db = prisma,
    retention = tombstoneExpiredEvidence,
    notifications,
    notificationProjector,
    audit,
    random = Math.random,
  } = {}) {
    this.db = db;
    this.retention = retention;
    this.notifications = notifications || new NotificationService(db);
    this.notificationProjector =
      notificationProjector ||
      new NotificationProjector({ db, notifications: this.notifications });
    this.audit = audit || new AuditService(db);
    this.random = random;
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
    await this.notificationProjector.refresh();
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
      if (result.errors?.length) throw new Error("RETENTION_ERRORS");
      await this.#recordTerminal({ schedule, leaseId, now, succeeded: true });
      await this.notifications.resolve(`scheduler:${schedule.scheduleKey}`);
      return { scheduleKey: schedule.scheduleKey, status: "SUCCEEDED", result };
    } catch (error) {
      const failureCount = schedule.failureCount + 1;
      try {
        await this.#recordTerminal({
          schedule, leaseId, now, succeeded: false, failureCount, error,
        });
      } catch {
        // The lease remains in place when audit persistence is unavailable.
        // That deliberately fails closed: another worker retries only after
        // expiry; we never record a terminal scheduler state without evidence.
        return { scheduleKey: schedule.scheduleKey, status: "FAILED" };
      }
      await this.notifications.open({
        kind: NOTIFICATION_KINDS.SCHEDULER_FAILURE,
        dedupeKey: `scheduler:${schedule.scheduleKey}`,
        summary: `Scheduled ${schedule.scheduleKey} failed; retry is pending.`,
      });
      return { scheduleKey: schedule.scheduleKey, status: "FAILED" };
    }
  }

  async #recordTerminal({ schedule, leaseId, now, succeeded, failureCount, error }) {
    await this.db.$transaction(async (tx) => {
      const completed = await tx.yusuf_schedules.updateMany({
        where: { id: schedule.id, leaseId },
        data: succeeded
          ? {
              lastRunAt: now,
              nextRunAt: nextCoalescedRunAt(now, schedule.intervalSeconds, this.random),
              failureCount: 0, lastErrorCode: null, leaseId: null, leaseExpiresAt: null,
              version: { increment: 1 },
            }
          : {
              failureCount, lastErrorCode: "SCHEDULE_EXECUTION_FAILED",
              nextRunAt: new Date(now.getTime() + failureDelaySeconds(failureCount) * 1000),
              leaseId: null, leaseExpiresAt: null, version: { increment: 1 },
            },
      });
      if (completed.count !== 1) throw new Error("SCHEDULE_LEASE_LOST");
      await this.audit.appendInTransaction(tx, {
        eventType: succeeded ? "scheduler.succeeded" : "scheduler.failed",
        principal: { type: PRINCIPAL_TYPES.SYSTEM, id: "yusuf-scheduler" },
        outcome: succeeded ? "SUCCEEDED" : "FAILED",
        resource: { type: "SCHEDULE", id: schedule.uuid },
        metadata: succeeded ? { scheduleKey: schedule.scheduleKey } : {
          scheduleKey: schedule.scheduleKey,
          reason:
            error.message === "RETENTION_ERRORS"
              ? "RETENTION_ERRORS"
              : "EXECUTION_FAILED",
        },
        requestId: `scheduler:${schedule.uuid}:${now.toISOString()}`,
      });
    });
  }
}

module.exports = {
  Scheduler,
  SCHEDULE_KINDS,
  failureDelaySeconds,
  nextCoalescedRunAt,
  DEFAULT_INTERVAL_SECONDS,
};
