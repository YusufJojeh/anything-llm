const { randomUUID } = require("crypto");
const prisma = require("../../../utils/prisma");

const NOTIFICATION_KINDS = Object.freeze({
  SCHEDULER_FAILURE: "SCHEDULER_FAILURE",
});

class NotificationService {
  constructor(db = prisma) {
    this.db = db;
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
    return this.db.yusuf_notifications.upsert({
      where: { dedupeKey },
      create: {
        uuid: randomUUID(),
        kind,
        severity,
        dedupeKey,
        summary,
        taskId,
        runId,
      },
      update: {
        severity,
        summary,
        taskId,
        runId,
        status: "OPEN",
        acknowledgedAt: null,
      },
    });
  }

  async acknowledge(uuid, { now = new Date() } = {}) {
    const updated = await this.db.yusuf_notifications.updateMany({
      where: { uuid, status: "OPEN" },
      data: { status: "ACKNOWLEDGED", acknowledgedAt: now },
    });
    return updated.count === 1;
  }
}

module.exports = { NotificationService, NOTIFICATION_KINDS };
