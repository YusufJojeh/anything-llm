const { CAREER_OPPORTUNITY_STATUSES } = require("../constants");

// Code-owned transition table. A new signal (or a new status) is a reviewed
// code change, not a runtime config surface — same discipline as
// monitoring/thresholds.js. See docs/yusuf-os/gate-b/career.md.
const CAREER_TRANSITIONS = Object.freeze({
  [CAREER_OPPORTUNITY_STATUSES.RESEARCHING]: Object.freeze([
    CAREER_OPPORTUNITY_STATUSES.APPLIED,
    CAREER_OPPORTUNITY_STATUSES.WITHDRAWN,
  ]),
  [CAREER_OPPORTUNITY_STATUSES.APPLIED]: Object.freeze([
    CAREER_OPPORTUNITY_STATUSES.INTERVIEWING,
    CAREER_OPPORTUNITY_STATUSES.REJECTED,
    CAREER_OPPORTUNITY_STATUSES.WITHDRAWN,
  ]),
  [CAREER_OPPORTUNITY_STATUSES.INTERVIEWING]: Object.freeze([
    CAREER_OPPORTUNITY_STATUSES.OFFER,
    CAREER_OPPORTUNITY_STATUSES.REJECTED,
    CAREER_OPPORTUNITY_STATUSES.WITHDRAWN,
  ]),
  [CAREER_OPPORTUNITY_STATUSES.OFFER]: Object.freeze([
    CAREER_OPPORTUNITY_STATUSES.REJECTED,
    CAREER_OPPORTUNITY_STATUSES.WITHDRAWN,
  ]),
  // Terminal — no legal transition out of REJECTED/WITHDRAWN. Re-pursuing the
  // same company/role later is deliberately a *new* opportunity row, not a
  // reopened one, so history is never silently rewritten.
  [CAREER_OPPORTUNITY_STATUSES.REJECTED]: Object.freeze([]),
  [CAREER_OPPORTUNITY_STATUSES.WITHDRAWN]: Object.freeze([]),
});

/** Pure, deterministic, unit-testable in isolation from the adapter that calls it. */
function isValidTransition(from, to) {
  if (!Object.values(CAREER_OPPORTUNITY_STATUSES).includes(to)) return false;
  const allowed = CAREER_TRANSITIONS[from];
  return Array.isArray(allowed) && allowed.includes(to);
}

module.exports = { CAREER_TRANSITIONS, isValidTransition };
