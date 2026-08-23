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
    await this.scheduler.ensureEvidenceRetention();
    const tick = async () => {
      if (this.running) return;
      this.running = true;
      try {
        await this.scheduler.tick();
      } catch {
        // Per-schedule errors are durable; this guard preserves future ticks.
      } finally {
        this.running = false;
      }
    };
    await tick();
    this.timer = setInterval(tick, this.pollMs);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
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
