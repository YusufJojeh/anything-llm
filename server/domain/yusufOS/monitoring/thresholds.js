const {
  MONITORING_CHECK_KEYS,
  MONITORING_CHECK_STATUSES,
} = require("../constants");

// Code-owned thresholds. A new signal or a changed number is a reviewed code
// change, not a runtime config surface — see docs/yusuf-os/gate-b/monitoring.md.
const SYSTEM_HEALTH_THRESHOLDS = Object.freeze({
  pendingApprovals: Object.freeze({ warn: 5, breach: 20 }),
  unresolvedIntents: Object.freeze({ warn: 1, breach: 5 }),
});

const STATUS_RANK = Object.freeze({
  OK: 0,
  WARN: 1,
  BREACH: 2,
});

function worseOf(a, b) {
  return STATUS_RANK[a] >= STATUS_RANK[b] ? a : b;
}

function rateStatus(value, { warn, breach }) {
  if (value >= breach) return MONITORING_CHECK_STATUSES.BREACH;
  if (value >= warn) return MONITORING_CHECK_STATUSES.WARN;
  return MONITORING_CHECK_STATUSES.OK;
}

/**
 * Pure evaluation of a `system.read_health` snapshot against code-owned
 * thresholds. No I/O — deterministic and unit-testable in isolation from the
 * adapter that calls it.
 */
function evaluateSystemHealth(snapshot) {
  let status = MONITORING_CHECK_STATUSES.OK;
  const reasons = [];

  const approvalsStatus = rateStatus(
    snapshot.pendingApprovals,
    SYSTEM_HEALTH_THRESHOLDS.pendingApprovals
  );
  status = worseOf(status, approvalsStatus);
  if (approvalsStatus !== MONITORING_CHECK_STATUSES.OK)
    reasons.push(`${snapshot.pendingApprovals} approval(s) pending`);

  const intentsStatus = rateStatus(
    snapshot.unresolvedIntents,
    SYSTEM_HEALTH_THRESHOLDS.unresolvedIntents
  );
  status = worseOf(status, intentsStatus);
  if (intentsStatus !== MONITORING_CHECK_STATUSES.OK)
    reasons.push(`${snapshot.unresolvedIntents} unresolved intent(s)`);

  if (!snapshot.controlPlaneHealthy) {
    status = worseOf(status, MONITORING_CHECK_STATUSES.BREACH);
    reasons.push("control plane DEGRADED");
  }
  if (snapshot.killSwitchEngaged) reasons.push("emergency stop engaged");

  const summary =
    reasons.length === 0
      ? "All monitored signals within threshold."
      : status === MONITORING_CHECK_STATUSES.OK
        ? `OK (informational): ${reasons.join("; ")}.`
        : `${status}: ${reasons.join("; ")}.`;

  return {
    status,
    summary: summary.slice(0, 500),
    threshold: SYSTEM_HEALTH_THRESHOLDS,
  };
}

const EVALUATORS = Object.freeze({
  [MONITORING_CHECK_KEYS.SYSTEM_HEALTH]: evaluateSystemHealth,
});

function evaluateCheck(checkKey, snapshot) {
  const evaluator = EVALUATORS[checkKey];
  if (!evaluator)
    throw new Error(`No evaluator registered for checkKey: ${checkKey}`);
  return evaluator(snapshot);
}

module.exports = {
  SYSTEM_HEALTH_THRESHOLDS,
  evaluateSystemHealth,
  evaluateCheck,
};
