import { CORE_STATES } from "./commandCenterModel";
import { STAGE_STATUS } from "./operationStages";

/**
 * The System Core's visual mode.
 *
 * A pure function of state the frontend already holds: the backend-derived
 * core state, the realtime connection, the local voice/command phase, and the
 * safe runtime stage. Nothing here is random and nothing is timed — the same
 * inputs always produce the same mode, which is what makes the Core's motion
 * meaningful rather than decorative.
 *
 * Precedence: truth about safety outranks activity. A listening microphone
 * never hides an emergency stop or a broken audit chain.
 */

export const CORE_MODES = Object.freeze({
  UNKNOWN: "UNKNOWN",
  BLOCKED: "BLOCKED",
  OFFLINE: "OFFLINE",
  LISTENING: "LISTENING",
  SPEAKING: "SPEAKING",
  WAITING_APPROVAL: "WAITING_APPROVAL",
  WARNING: "WARNING",
  THINKING: "THINKING",
  TOOL_EXECUTION: "TOOL_EXECUTION",
  WORKING: "WORKING",
  HEALTHY: "HEALTHY",
});

/**
 * `spin` is the ambient ring period in seconds (null = static). `pulse` names
 * the CSS pulse treatment. `hue` resolves to a token, never an ad-hoc colour.
 */
export const CORE_MODE_PARAMS = Object.freeze({
  [CORE_MODES.UNKNOWN]: {
    hue: "neutral",
    spin: null,
    pulse: null,
    intensity: 0.25,
  },
  [CORE_MODES.BLOCKED]: {
    hue: "critical",
    spin: 90,
    pulse: "critical",
    intensity: 0.5,
  },
  [CORE_MODES.OFFLINE]: {
    hue: "neutral",
    spin: null,
    pulse: null,
    intensity: 0.15,
  },
  [CORE_MODES.LISTENING]: {
    hue: "cyan",
    spin: 40,
    pulse: "voice",
    intensity: 0.8,
  },
  [CORE_MODES.SPEAKING]: {
    hue: "cyan",
    spin: 40,
    pulse: "voice",
    intensity: 0.85,
  },
  [CORE_MODES.WAITING_APPROVAL]: {
    hue: "amber",
    spin: 70,
    pulse: "amber",
    intensity: 0.7,
  },
  [CORE_MODES.WARNING]: {
    hue: "amber",
    spin: 90,
    pulse: "amber-slow",
    intensity: 0.55,
  },
  [CORE_MODES.THINKING]: {
    hue: "cyan",
    spin: 28,
    pulse: "inner",
    intensity: 0.85,
  },
  [CORE_MODES.TOOL_EXECUTION]: {
    hue: "cyan",
    spin: 22,
    pulse: "outer",
    intensity: 0.9,
  },
  [CORE_MODES.WORKING]: {
    hue: "cyan",
    spin: 32,
    pulse: "breathe",
    intensity: 0.75,
  },
  [CORE_MODES.HEALTHY]: {
    hue: "cyan",
    spin: 60,
    pulse: "breathe",
    intensity: 0.6,
  },
});

export function deriveCoreMode({
  coreState = null,
  connection = null,
  voicePhase = "IDLE",
  stages = null,
} = {}) {
  if (!coreState) return CORE_MODES.UNKNOWN;
  if (
    coreState === CORE_STATES.EMERGENCY_STOP ||
    coreState === CORE_STATES.SECURITY_ALERT ||
    coreState === CORE_STATES.BLOCKED
  )
    return CORE_MODES.BLOCKED;
  if (connection === "OFFLINE") return CORE_MODES.OFFLINE;
  if (voicePhase === "LISTENING") return CORE_MODES.LISTENING;
  if (voicePhase === "SPEAKING") return CORE_MODES.SPEAKING;
  // Approval state comes only from the backend projection: a local
  // "APPROVAL_REQUIRED" command result goes stale the moment Yusuf decides it.
  if (coreState === CORE_STATES.WAITING_APPROVAL)
    return CORE_MODES.WAITING_APPROVAL;
  if (
    coreState === CORE_STATES.RECONCILING ||
    coreState === CORE_STATES.DEGRADED ||
    coreState === CORE_STATES.OFFLINE_ADAPTER
  )
    return CORE_MODES.WARNING;
  if (stages?.EXECUTE === STAGE_STATUS.ACTIVE) return CORE_MODES.TOOL_EXECUTION;
  if (
    voicePhase === "PROCESSING" ||
    voicePhase === "TRANSCRIBING" ||
    stages?.REASON === STAGE_STATUS.ACTIVE
  )
    return CORE_MODES.THINKING;
  if (coreState === CORE_STATES.WORKING) return CORE_MODES.WORKING;
  return CORE_MODES.HEALTHY;
}

export function coreModeParams(mode) {
  return CORE_MODE_PARAMS[mode] || CORE_MODE_PARAMS[CORE_MODES.UNKNOWN];
}
