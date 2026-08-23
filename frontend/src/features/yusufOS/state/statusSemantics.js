/**
 * The single status vocabulary for Yusuf OS.
 *
 * Backend enums are the input; a `tone` is the output. Components never pick a
 * colour or an icon for a status themselves — if a new backend state appears,
 * it resolves to `unknown` here and shows as unknown everywhere at once rather
 * than silently rendering as "fine" in one component and "error" in another.
 *
 * Every tone is required to have three independent carriers: a colour, an
 * icon, and a translated text label. Colour is never the only signal
 * (WCAG 2.2 1.4.1).
 */

export const TONES = Object.freeze({
  HEALTHY: "healthy",
  ACTIVE: "active",
  WAITING: "waiting",
  APPROVAL: "approval",
  WARNING: "warning",
  BLOCKED: "blocked",
  ERROR: "error",
  OFFLINE: "offline",
  UNKNOWN: "unknown",
});

const TONE_STYLE = Object.freeze({
  [TONES.HEALTHY]: {
    graphic: "var(--yos-healthy-graphic)",
    text: "var(--yos-healthy-text)",
  },
  [TONES.ACTIVE]: {
    graphic: "var(--yos-active-graphic)",
    text: "var(--yos-active-text)",
  },
  [TONES.WAITING]: {
    graphic: "var(--yos-waiting-graphic)",
    text: "var(--yos-waiting-text)",
  },
  [TONES.APPROVAL]: {
    graphic: "var(--yos-approval-graphic)",
    text: "var(--yos-approval-text)",
  },
  [TONES.WARNING]: {
    graphic: "var(--yos-warning-graphic)",
    text: "var(--yos-warning-text)",
  },
  [TONES.BLOCKED]: {
    graphic: "var(--yos-blocked-graphic)",
    text: "var(--yos-blocked-text)",
  },
  [TONES.ERROR]: {
    graphic: "var(--yos-error-graphic)",
    text: "var(--yos-error-text)",
  },
  [TONES.OFFLINE]: {
    graphic: "var(--yos-offline-graphic)",
    text: "var(--yos-offline-text)",
  },
  [TONES.UNKNOWN]: {
    graphic: "var(--yos-unknown-graphic)",
    text: "var(--yos-unknown-text)",
  },
});

/**
 * Which icon name a tone uses. Names are resolved to Phosphor components in
 * `StatusIcon.jsx`; keeping them as strings here means this module stays pure
 * and directly testable.
 */
const TONE_ICON = Object.freeze({
  [TONES.HEALTHY]: "check",
  [TONES.ACTIVE]: "activity",
  [TONES.WAITING]: "hourglass",
  [TONES.APPROVAL]: "shieldQuestion",
  [TONES.WARNING]: "warning",
  [TONES.BLOCKED]: "prohibit",
  [TONES.ERROR]: "xCircle",
  [TONES.OFFLINE]: "plugsDisconnected",
  [TONES.UNKNOWN]: "question",
});

/** Agent run/lifecycle status → tone. Source: `constants.js` RUN_STATUSES. */
const AGENT_STATUS_TONE = Object.freeze({
  IDLE: TONES.HEALTHY,
  RUNNING: TONES.ACTIVE,
  WAITING: TONES.WAITING,
  WAITING_TOOL: TONES.ACTIVE,
  WAITING_HANDOFF: TONES.WAITING,
  WAITING_DEPENDENCY: TONES.WAITING,
  WAITING_APPROVAL: TONES.APPROVAL,
  QUEUED: TONES.WAITING,
  VERIFYING: TONES.ACTIVE,
  BLOCKED: TONES.BLOCKED,
  FAILED: TONES.ERROR,
  FAILED_UNKNOWN: TONES.WARNING,
  COMPLETED: TONES.HEALTHY,
  CANCELLED: TONES.OFFLINE,
  DISABLED: TONES.OFFLINE,
});

/** Task status → tone. Source: `constants.js` TASK_STATUSES. */
const TASK_STATUS_TONE = Object.freeze({
  PLANNED: TONES.WAITING,
  READY: TONES.WAITING,
  RUNNING: TONES.ACTIVE,
  BLOCKED: TONES.BLOCKED,
  WAITING_APPROVAL: TONES.APPROVAL,
  COMPLETED: TONES.HEALTHY,
  FAILED: TONES.ERROR,
  CANCELLED: TONES.OFFLINE,
});

/**
 * Approval status → tone.
 *
 * APPROVED is deliberately *not* healthy-green: an approved action has not
 * executed yet, and showing it as done would misrepresent the security state
 * (Gate B §8, "explicit distinction between approval and execution").
 */
const APPROVAL_STATUS_TONE = Object.freeze({
  PENDING: TONES.APPROVAL,
  APPROVED: TONES.ACTIVE,
  CONSUMED: TONES.HEALTHY,
  REJECTED: TONES.OFFLINE,
  EXPIRED: TONES.OFFLINE,
  INVALIDATED: TONES.WARNING,
});

/** Intent/execution status → tone. Source: `constants.js` INTENT_STATUSES. */
const EXECUTION_STATUS_TONE = Object.freeze({
  INTENT_CREATED: TONES.WAITING,
  POLICY_EVALUATED: TONES.WAITING,
  POLICY_DENIED: TONES.BLOCKED,
  FORBIDDEN: TONES.BLOCKED,
  WAITING_APPROVAL: TONES.APPROVAL,
  AUTHORIZED: TONES.ACTIVE,
  EXECUTING: TONES.ACTIVE,
  EXECUTED_UNVERIFIED: TONES.WARNING,
  VERIFIED: TONES.HEALTHY,
  FAILED: TONES.ERROR,
  // Not an error: an external effect may have happened and Yusuf OS is still
  // proving which. It gets its own treatment so it cannot be mistaken for a
  // plain failure (Gate G brief §55).
  FAILED_UNKNOWN: TONES.WARNING,
  INVALIDATED: TONES.WARNING,
  CANCELLED: TONES.OFFLINE,
});

/**
 * Audit chain status → tone.
 *
 * UNCHECKED is never healthy, and STALE is never current-green: a verdict only
 * describes the chain it actually walked.
 */
const AUDIT_STATUS_TONE = Object.freeze({
  VALID: TONES.HEALTHY,
  STALE: TONES.WARNING,
  UNCHECKED: TONES.UNKNOWN,
  BROKEN: TONES.ERROR,
  INVALID: TONES.ERROR,
});

const SYSTEM_STATUS_TONE = Object.freeze({
  HEALTHY: TONES.HEALTHY,
  DEGRADED: TONES.WARNING,
  STOPPED: TONES.OFFLINE,
});

const ADAPTER_STATUS_TONE = Object.freeze({
  AVAILABLE: TONES.HEALTHY,
  DEGRADED: TONES.WARNING,
  UNAVAILABLE: TONES.OFFLINE,
  UNCHECKED: TONES.UNKNOWN,
});

// Scheduler status is persisted independently of system health. An ACTIVE
// schedule is an enabled timer, not a currently running Agent or an approval.
const SCHEDULER_STATUS_TONE = Object.freeze({
  ACTIVE: TONES.HEALTHY,
  PAUSED: TONES.WARNING,
  DISABLED: TONES.OFFLINE,
  FAILED: TONES.ERROR,
});

const REVIEW_VERDICT_TONE = Object.freeze({
  PASS: TONES.HEALTHY,
  PASS_WITH_WARNINGS: TONES.WARNING,
  BLOCK: TONES.BLOCKED,
});

const HANDOFF_STATUS_TONE = Object.freeze({
  PENDING: TONES.WAITING,
  ACCEPTED: TONES.ACTIVE,
  COMPLETED: TONES.HEALTHY,
  CANCELLED: TONES.OFFLINE,
});

const CONNECTION_TONE = Object.freeze({
  LIVE: TONES.HEALTHY,
  CONNECTING: TONES.WAITING,
  RECONNECTING: TONES.WAITING,
  STALE: TONES.WARNING,
  OFFLINE: TONES.OFFLINE,
});

const DOMAINS = Object.freeze({
  agent: AGENT_STATUS_TONE,
  task: TASK_STATUS_TONE,
  approval: APPROVAL_STATUS_TONE,
  execution: EXECUTION_STATUS_TONE,
  audit: AUDIT_STATUS_TONE,
  system: SYSTEM_STATUS_TONE,
  adapter: ADAPTER_STATUS_TONE,
  scheduler: SCHEDULER_STATUS_TONE,
  review: REVIEW_VERDICT_TONE,
  handoff: HANDOFF_STATUS_TONE,
  connection: CONNECTION_TONE,
});

/**
 * Resolves a backend status in a given domain to a tone.
 *
 * An unrecognised value resolves to `unknown` rather than throwing or
 * defaulting to healthy — a status the frontend does not understand must never
 * read as "everything is fine".
 */
export function toneFor(domain, status) {
  const table = DOMAINS[domain];
  if (!table || typeof status !== "string") return TONES.UNKNOWN;
  return table[status] || TONES.UNKNOWN;
}

export function toneStyle(tone) {
  return TONE_STYLE[tone] || TONE_STYLE[TONES.UNKNOWN];
}

export function toneIcon(tone) {
  return TONE_ICON[tone] || TONE_ICON[TONES.UNKNOWN];
}

/**
 * Translation key for a raw backend status. Falls back to the raw value so an
 * untranslated new backend state still shows its real name rather than a blank
 * chip or a wrong one.
 */
export function statusLabelKey(domain, status) {
  return `yusufOS:status.${domain}.${status}`;
}

/** Ordering used wherever attention items compete for the operator's eye. */
export const TONE_SEVERITY = Object.freeze({
  [TONES.BLOCKED]: 0,
  [TONES.ERROR]: 1,
  [TONES.APPROVAL]: 2,
  [TONES.WARNING]: 3,
  [TONES.OFFLINE]: 4,
  [TONES.UNKNOWN]: 5,
  [TONES.WAITING]: 6,
  [TONES.ACTIVE]: 7,
  [TONES.HEALTHY]: 8,
});
