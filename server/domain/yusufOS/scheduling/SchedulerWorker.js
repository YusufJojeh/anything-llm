const { Scheduler } = require("./Scheduler");

const POLL_MS = 30 * 1000;

class SchedulerWorker {
  constructor({ scheduler = new Scheduler(), pollMs = POLL_MS } = {}) {
    this.scheduler = scheduler;
    this.pollMs = pollMs;
    this.timer = null;
    this.running = false;
  }

  async start() {
    if (this.timer) return;
    const tick = async () => {
      if (this.running) return;
      this.running = true;
      try {
        await this.scheduler.ensureEvidenceRetention();
        const results = await this.scheduler.tick();
        if (results.some((result) => result.status === "FAILED"))
          throw new Error("SCHEDULE_JOB_FAILED");
        await this.#recordHealth({ now: new Date() });
      } catch (error) {
        // A boot/tick failure must not silently disable scheduling or leave
        // an old ACTIVE row looking alive. Keep retrying, and persist the
        // failure whenever the database is reachable again.
        await this.#recordHealth({ now: new Date(), error });
      } finally {
        this.running = false;
      }
    };
    this.timer = setInterval(tick, this.pollMs);
    this.timer.unref?.();
    await tick();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async #recordHealth({ now, error = null }) {
    try {
      await this.scheduler.db.yusuf_schedules.updateMany({
        where: { scheduleKey: "EVIDENCE_RETENTION" },
        data: error
          ? {
              workerLastFailureAt: now,
              workerLastErrorCode: "SCHEDULER_WORKER_FAILED",
            }
          : {
              workerLastTickAt: now,
              workerLastErrorCode: null,
            },
      });
    } catch {
      // The timer remains registered and will retry. There is no truthful
      // durable status to write while the database itself is unavailable.
    }
  }
}

let worker = null;
async function startSchedulerWorker() {
  if (
    String(process.env.YUSUF_OS_SCHEDULER_ENABLED || "true").toLowerCase() ===
    "false"
  )
    return null;
  if (!worker) worker = new SchedulerWorker();
  await worker.start();
  return worker;
}

module.exports = { SchedulerWorker, startSchedulerWorker, POLL_MS };
