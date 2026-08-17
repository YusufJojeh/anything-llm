const { log, conclude } = require("./helpers/index.js");
const { v4: uuidv4 } = require("uuid");
const { safeJsonParse } = require("../utils/http");
const {
  agentActionCb,
  SCHEDULED_JOB_TIMEOUT_MS,
  sendWebPushNotification,
} = require("./helpers/scheduled-job-helper.js");
const { ScheduledJob } = require("../models/scheduledJob.js");
const { ScheduledJobRun } = require("../models/scheduledJobRun.js");
const {
  denyUnattendedToolApproval,
  assertNoUngovernedScheduledExtensions,
} = require("./helpers/scheduled-approval-policy.js");

/** Status of the scheduled job run @type {'success' | 'failed' | 'timed_out' | 'not_found' | 'killed' | undefined} */
let status;
let runId = null;

process.on("SIGTERM", async () => {
  status = "killed";
  log("Received SIGTERM, marking job as killed by user");
  if (runId) await ScheduledJobRun.kill(runId);
  conclude();
});

process.on("message", async (payload) => {
  const { jobId, runId: payloadRunId } = payload;
  runId = payloadRunId;
  let timeoutId = null;
  let errorMessage = null;

  // The run row was created by the parent process (BackgroundService) in
  // status `queued` (it may have been waiting in p-queue). The worker
  // transitions it to `running` here so `startedAt` reflects actual execution
  // start, then runs to a terminal state. If the job has been deleted between
  // enqueue and now, fail the row.
  try {
    if (!jobId || !runId) return;

    const job = await ScheduledJob.get({ id: Number(jobId) });
    if (!job) {
      log(`Scheduled job ${jobId} not found`);
      status = "not_found";
      return;
    }

    // Transition queued -> running. If this returns false, the row was
    // already moved to a terminal state (e.g. parent failed it because it
    // thought the worker had died). Bail out without touching it further.
    const transitioned = await ScheduledJobRun.markRunning(runId);
    if (!transitioned) {
      log(
        `Scheduled job "${job.name}" (id=${job.id}) is no longer queued, skipping`
      );
      return;
    }

    log(
      `Starting scheduled job: "${job.name}" (id=${job.id}) with timeout ${SCHEDULED_JOB_TIMEOUT_MS}ms`
    );
    await ScheduledJob.updateRunTimestamps(job.id);
    const { handler, thoughts, toolCalls, state } = agentActionCb();

    const toolOverrides = safeJsonParse(job.tools, []);
    assertNoUngovernedScheduledExtensions(toolOverrides);

    const { EphemeralAgentHandler } = require("../utils/agents/ephemeral.js");
    const agentHandler = await new EphemeralAgentHandler({
      uuid: uuidv4(),
      prompt: job.prompt,
      blockUngovernedExtensions: true,
    }).init();

    // Tool overrides control which tools the agent can use:
    // - Array with items: only those specific tools are loaded
    // - Empty array: no tools are loaded
    await agentHandler.createAIbitat({
      handler,
      toolOverrides,
    });

    // An unattended worker is not an approval principal. Legacy tools now fail
    // closed here; Yusuf-governed tools use their durable Action Boundary path.
    agentHandler.aibitat.requestToolApproval = () =>
      denyUnattendedToolApproval(log);

    // Capture tool results for the execution trace
    agentHandler.aibitat.onToolCallResult(
      ({ toolName, arguments: args, result }) => {
        toolCalls.push({
          toolName,
          arguments: args,
          result,
          timestamp: Date.now(),
        });
      }
    );

    const startTime = Date.now();
    await Promise.race([
      agentHandler.startAgentCluster(),
      new Promise((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error("SCHEDULED_JOB_TIMEOUT")),
          SCHEDULED_JOB_TIMEOUT_MS
        );
      }),
    ]).finally(() => {
      if (!timeoutId) return;
      clearTimeout(timeoutId);
      timeoutId = null;
    });
    const duration = Date.now() - startTime;

    // Get outputs from aibitat which include proper type info (e.g., PptxFileDownload, ExcelFileDownload)
    // for correct re-rendering when porting to workspace chat
    const outputs = agentHandler.getPendingOutputs();

    status = "success";
    await ScheduledJobRun.complete(runId, {
      result: {
        text: state.textResponse,
        thoughts,
        toolCalls,
        outputs,
        metrics: state.metrics,
        duration,
      },
    });
    log(`Scheduled job "${job.name}" completed in ${duration}ms)`);
    await sendWebPushNotification(job, runId, state.textResponse, log);
  } catch (error) {
    if (error.message === "SCHEDULED_JOB_TIMEOUT") {
      status = "timed_out";
      log("Scheduled job timed out");
    } else {
      status = "failed";
      log(`Scheduled job error: ${error.message}`);
      errorMessage = error.message;
    }
  } finally {
    switch (status) {
      case "not_found":
        await ScheduledJobRun.failIfNotTerminal(runId, "Job no longer exists");
        break;
      case "timed_out":
        await ScheduledJobRun.timeout(runId);
        break;
      case "failed":
        await ScheduledJobRun.fail(runId, { error: errorMessage });
        break;
      default: // Do nothing by default (success, killed, other)
        break;
    }

    if (timeoutId) clearTimeout(timeoutId);
    conclude();
  }
});
