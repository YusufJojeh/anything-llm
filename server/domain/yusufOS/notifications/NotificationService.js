const { randomUUID } = require("crypto");
const prisma = require("../../../utils/prisma");
const { AuditService } = require("../audit/AuditService");
const { PRINCIPAL_TYPES } = require("../constants");

const NOTIFICATION_KINDS = Object.freeze({
  APPROVAL_NEEDED: "APPROVAL_NEEDED",
  TASK_BLOCKED: "TASK_BLOCKED",
  EXECUTION_UNKNOWN: "EXECUTION_UNKNOWN",
  MONITORING_BREACH: "MONITORING_BREACH",
  ADAPTER_OFFLINE: "ADAPTER_OFFLINE",
  SCHEDULER_FAILURE: "SCHEDULER_FAILURE",
  MODEL_UNAVAILABLE: "MODEL_UNAVAILABLE",
  BROWSER_DISCONNECTED: "BROWSER_DISCONNECTED",
  INBOX_IMPORTANT: "INBOX_IMPORTANT",
});

class NotificationService {
  constructor(db = prisma) {
    this.db = db;
    this.audit = new AuditService(db);
  }

  async open({
    kind,
    severity = "WARNING",
    dedupeKey,
    summary,
    taskId,
    runId,
  }) {
    if (!Object.values(NOTIFICATION_KINDS).includes(kind))
      throw new Error("Unknown Yusuf OS notification kind.");
    if (typeof dedupeKey !== "string" || dedupeKey.length === 0)
      throw new Error("Notification dedupeKey is required.");
    if (typeof summary !== "string" || summary.length === 0)
      throw new Error("Notification summary is required.");
    return this.db.$transaction(async (tx) => {
      // A durable acknowledgement is an operator decision, not a transient
      // projection detail. Rebuilding the same attention source must neither
      // reopen it nor append another audit event on every scheduler poll.
      const existing = await tx.yusuf_notifications.findUnique({
        where: { dedupeKey },
      });
      if (existing && existing.status !== "RESOLVED") return existing;
      if (existing) {
        const reopened = await tx.yusuf_notifications.update({
          where: { dedupeKey },
          data: { severity, summary, taskId, runId, status: "OPEN", acknowledgedAt: null },
        });
        await this.audit.appendInTransaction(tx, {
          eventType: "notification.reopened",
          principal: { type: PRINCIPAL_TYPES.SYSTEM, id: "notification-service" },
          outcome: "OPEN", resource: { type: "NOTIFICATION", id: reopened.uuid },
          metadata: { kind, severity }, requestId: `notification:${reopened.uuid}:reopened`,
        });
        return reopened;
      }
      const notification = await tx.yusuf_notifications.create({
        data: {
          uuid: randomUUID(),
          kind,
          severity,
          dedupeKey,
          summary,
          taskId,
          runId,
        },
      });
      await this.audit.appendInTransaction(tx, {
        eventType: "notification.opened",
        principal: { type: PRINCIPAL_TYPES.SYSTEM, id: "notification-service" },
        outcome: "OPEN",
        resource: { type: "NOTIFICATION", id: notification.uuid },
        metadata: { kind, severity },
        requestId: `notification:${notification.uuid}`,
      });
      return notification;
    });
  }

  async acknowledge(uuid, { now = new Date() } = {}) {
    const updated = await this.db.$transaction(async (tx) => {
      const result = await tx.yusuf_notifications.updateMany({
        where: { uuid, status: "OPEN" },
        data: { status: "ACKNOWLEDGED", acknowledgedAt: now },
      });
      if (result.count === 1)
        await this.audit.appendInTransaction(tx, {
          eventType: "notification.acknowledged",
          principal: { type: PRINCIPAL_TYPES.USER, id: "yusuf" },
          outcome: "ACKNOWLEDGED",
          resource: { type: "NOTIFICATION", id: uuid },
          metadata: {},
          requestId: `notification:${uuid}:acknowledged`,
        });
      return result;
    });
    return updated.count === 1;
  }

  async resolve(dedupeKey) {
    return this.db.$transaction(async (tx) => {
      const result = await tx.yusuf_notifications.updateMany({
        where: { dedupeKey, status: { in: ["OPEN", "ACKNOWLEDGED"] } },
        data: { status: "RESOLVED" },
      });
      if (result.count === 1) {
        const notification = await tx.yusuf_notifications.findUnique({ where: { dedupeKey } });
        await this.audit.appendInTransaction(tx, {
          eventType: "notification.resolved",
          principal: { type: PRINCIPAL_TYPES.SYSTEM, id: "notification-service" },
          outcome: "RESOLVED", resource: { type: "NOTIFICATION", id: notification.uuid },
          metadata: {}, requestId: `notification:${notification.uuid}:resolved`,
        });
      }
      return result.count === 1;
    });
  }

  async resolveMissing({ kinds, activeDedupeKeys }) {
    const candidates = await this.db.yusuf_notifications.findMany({
      where: { kind: { in: kinds }, status: { in: ["OPEN", "ACKNOWLEDGED"] } },
      select: { dedupeKey: true },
    });
    for (const { dedupeKey } of candidates)
      if (!activeDedupeKeys.has(dedupeKey)) await this.resolve(dedupeKey);
  }
}

module.exports = { NotificationService, NOTIFICATION_KINDS };
