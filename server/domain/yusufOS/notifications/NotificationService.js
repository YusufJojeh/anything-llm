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
      if (existing) return existing;
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
}

module.exports = { NotificationService, NOTIFICATION_KINDS };
