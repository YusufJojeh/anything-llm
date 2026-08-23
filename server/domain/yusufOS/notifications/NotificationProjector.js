const prisma = require("../../../utils/prisma");
const {
  NotificationService,
  NOTIFICATION_KINDS,
} = require("./NotificationService");
const { BrowserAdapter } = require("../adapters/browser/BrowserAdapter");
const { LocalGitAdapter } = require("../adapters/localGit/LocalGitAdapter");
const { brokerEnabled } = require("../adapters/browser/originPolicy");

// Rebuilds local operator attention from durable facts. It is deliberately
// idempotent: realtime delivery is a hint, while the notification table is
// the recoverable source of truth after restart or a missed event.
class NotificationProjector {
  constructor({ db = prisma, notifications, browserAdapter, localGitAdapter } = {}) {
    this.db = db;
    this.notifications = notifications || new NotificationService(db);
    this.browserAdapter = browserAdapter || new BrowserAdapter();
    this.localGitAdapter = localGitAdapter || new LocalGitAdapter({ db });
  }

  async refresh() {
    const [
      approvals,
      blockedTasks,
      unknownIntents,
      breaches,
      modelFailures,
      inbox,
    ] = await Promise.all([
      this.db.yusuf_approval_requests.findMany({
        where: { status: "PENDING" },
        select: { uuid: true, intent: { select: { taskId: true } } },
      }),
      this.db.yusuf_tasks.findMany({
        where: { status: "BLOCKED" },
        select: { id: true, uuid: true },
      }),
      this.db.yusuf_action_intents.findMany({
        where: { status: "FAILED_UNKNOWN" },
        select: { uuid: true, taskId: true },
      }),
      this.db.yusuf_monitoring_checks.findMany({
        where: { status: "BREACH" },
        select: { uuid: true },
      }),
      this.db.yusuf_agent_runs.findMany({
        where: { failureKind: "MODEL_UNAVAILABLE" },
        select: { uuid: true, taskId: true },
      }),
      this.db.yusuf_inbox_messages.findMany({
        where: {
          classification: { in: ["INTERVIEW", "REJECTION"] },
          status: "TRIAGED",
        },
        select: { uuid: true },
      }),
    ]);
    const operations = [
      ...approvals.map((row) => () =>
        this.notifications.open({
          kind: NOTIFICATION_KINDS.APPROVAL_NEEDED,
          severity: "ACTION",
          dedupeKey: `approval:${row.uuid}`,
          summary: "A governed action is waiting for Yusuf approval.",
          taskId: row.intent.taskId,
        })
      ),
      ...blockedTasks.map((row) => () =>
        this.notifications.open({
          kind: NOTIFICATION_KINDS.TASK_BLOCKED,
          severity: "WARNING",
          dedupeKey: `task-blocked:${row.uuid}`,
          summary: "A Yusuf OS task is blocked.",
          taskId: row.id,
        })
      ),
      ...unknownIntents.map((row) => () =>
        this.notifications.open({
          kind: NOTIFICATION_KINDS.EXECUTION_UNKNOWN,
          severity: "CRITICAL",
          dedupeKey: `execution-unknown:${row.uuid}`,
          summary: "An external action needs reconciliation before retry.",
          taskId: row.taskId,
        })
      ),
      ...breaches.map((row) => () =>
        this.notifications.open({
          kind: NOTIFICATION_KINDS.MONITORING_BREACH,
          severity: "WARNING",
          dedupeKey: `monitoring-breach:${row.uuid}`,
          summary: "A monitored threshold breached its code-owned limit.",
        })
      ),
      ...modelFailures.map((row) => () =>
        this.notifications.open({
          kind: NOTIFICATION_KINDS.MODEL_UNAVAILABLE,
          severity: "WARNING",
          dedupeKey: `model-unavailable:${row.uuid}`,
          summary: "A model provider was unavailable for an Agent run.",
          taskId: row.taskId,
        })
      ),
      ...inbox.map((row) => () =>
        this.notifications.open({
          kind: NOTIFICATION_KINDS.INBOX_IMPORTANT,
          severity: "ACTION",
          dedupeKey: `inbox:${row.uuid}`,
          summary: "An important Inbox message was classified.",
        })
      ),
    ];
    // The broker being disabled is a deliberate local safety posture, not an
    // outage. Once enabled, however, an unavailable CDP endpoint is durable
    // operator attention. Git availability is likewise a concrete governed
    // adapter dependency rather than an enum-only notification kind.
    const safeAvailability = async (adapter) => {
      try {
        return (await adapter.availability()) || { status: "UNAVAILABLE" };
      } catch {
        return { status: "UNAVAILABLE" };
      }
    };
    const [browser, git] = await Promise.all([
      brokerEnabled()
        ? safeAvailability(this.browserAdapter)
        : { status: "DISABLED" },
      safeAvailability(this.localGitAdapter),
    ]);
    if (browser.status !== "DISABLED" && browser.status !== "AVAILABLE")
      operations.push(() => this.notifications.open({
        kind: NOTIFICATION_KINDS.BROWSER_DISCONNECTED,
        severity: "WARNING", dedupeKey: "adapter:browser-broker",
        summary: "The enabled Browser Broker is disconnected.",
      }));
    if (git.status !== "AVAILABLE")
      operations.push(() => this.notifications.open({
        kind: NOTIFICATION_KINDS.ADAPTER_OFFLINE,
        severity: "WARNING", dedupeKey: "adapter:local-git",
        summary: "The governed Local Git adapter is unavailable.",
      }));
    // SQLite is used for the local control plane and permits only one writer;
    // serializing these short audited transactions also preserves a single
    // deterministic audit chain on database engines with stricter locking.
    for (const operation of operations) await operation();
    return operations.length;
  }
}

module.exports = { NotificationProjector };
