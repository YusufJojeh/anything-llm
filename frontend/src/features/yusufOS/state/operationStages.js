/**
 * Safe, high-level runtime stages: REASON · PLAN · EXECUTE · VERIFY · LEARN.
 *
 * These are *not* model reasoning. They are derived only from event types the
 * server already streams (Gate F event contract) plus the local command phase,
 * so they say "a governed action was verified 4s ago", never "the model is
 * thinking about X". No event payload text is read here.
 *
 * LEARN has no backing event today — approved knowledge/memory writes are not
 * in the stream — so it is always NOT_REPORTED rather than faked.
 */

export const STAGES = Object.freeze([
  "REASON",
  "PLAN",
  "EXECUTE",
  "VERIFY",
  "LEARN",
]);

export const STAGE_STATUS = Object.freeze({
  ACTIVE: "ACTIVE",
  RECENT: "RECENT",
  IDLE: "IDLE",
  NOT_REPORTED: "NOT_REPORTED",
});

export const EVENT_STAGE = Object.freeze({
  "agent.run.started": "REASON",
  "task.delegated": "PLAN",
  "intent.created": "PLAN",
  "policy.decision": "PLAN",
  "approval.decided": "PLAN",
  "execution.claimed": "EXECUTE",
  "agent.run.waiting_tool": "EXECUTE",
  "agent.run.verifying": "VERIFY",
  "execution.verified": "VERIFY",
});

// How long a stage stays "active" after its last event, and "recent" after that.
export const ACTIVE_WINDOW_MS = 15000;
export const RECENT_WINDOW_MS = 120000;

function eventTime(event) {
  const received = Date.parse(event?.receivedAt || "");
  if (Number.isFinite(received)) return received;
  const occurred = Date.parse(event?.occurredAt || "");
  return Number.isFinite(occurred) ? occurred : null;
}

export function deriveStages({
  recentEvents = [],
  voicePhase = "IDLE",
  now = Date.now(),
} = {}) {
  const result = {
    REASON: STAGE_STATUS.IDLE,
    PLAN: STAGE_STATUS.IDLE,
    EXECUTE: STAGE_STATUS.IDLE,
    VERIFY: STAGE_STATUS.IDLE,
    LEARN: STAGE_STATUS.NOT_REPORTED,
  };
  // Newest stage-bearing event wins "active"; older ones in window are recent.
  let activeAssigned = false;
  for (const event of recentEvents) {
    const stage = EVENT_STAGE[event?.type];
    if (!stage) continue;
    const at = eventTime(event);
    if (at === null) continue;
    const age = now - at;
    if (age < 0 || age > RECENT_WINDOW_MS) continue;
    if (!activeAssigned && age <= ACTIVE_WINDOW_MS) {
      result[stage] = STAGE_STATUS.ACTIVE;
      activeAssigned = true;
    } else if (result[stage] === STAGE_STATUS.IDLE) {
      result[stage] = STAGE_STATUS.RECENT;
    }
  }
  // A command in flight is a real model-processing stage on the server.
  if (voicePhase === "PROCESSING" && !activeAssigned)
    result.REASON = STAGE_STATUS.ACTIVE;
  return result;
}

export function activeStage(stages) {
  return (
    STAGES.find((stage) => stages?.[stage] === STAGE_STATUS.ACTIVE) || null
  );
}
