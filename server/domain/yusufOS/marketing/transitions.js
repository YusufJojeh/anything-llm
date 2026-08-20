const { MARKETING_CONTENT_STATUSES } = require("../constants");

// Code-owned transition table. A new status is a reviewed code change, not a
// runtime config surface — same discipline as career/transitions.js and
// monitoring/thresholds.js. See docs/yusuf-os/gate-b/marketing.md.
const MARKETING_TRANSITIONS = Object.freeze({
  [MARKETING_CONTENT_STATUSES.IDEA]: Object.freeze([
    MARKETING_CONTENT_STATUSES.DRAFTING,
    MARKETING_CONTENT_STATUSES.ARCHIVED,
  ]),
  [MARKETING_CONTENT_STATUSES.DRAFTING]: Object.freeze([
    MARKETING_CONTENT_STATUSES.READY_FOR_REVIEW,
    MARKETING_CONTENT_STATUSES.ARCHIVED,
  ]),
  [MARKETING_CONTENT_STATUSES.READY_FOR_REVIEW]: Object.freeze([
    MARKETING_CONTENT_STATUSES.SCHEDULED,
    // Sent back for revision — unlike Career, this pipeline allows one
    // deliberate step backward (review found problems), not just forward
    // progress or archival. See "Why one backward edge" in the design note.
    MARKETING_CONTENT_STATUSES.DRAFTING,
    MARKETING_CONTENT_STATUSES.ARCHIVED,
  ]),
  [MARKETING_CONTENT_STATUSES.SCHEDULED]: Object.freeze([
    MARKETING_CONTENT_STATUSES.PUBLISHED,
    // Pulled back before it went out.
    MARKETING_CONTENT_STATUSES.DRAFTING,
    MARKETING_CONTENT_STATUSES.ARCHIVED,
  ]),
  [MARKETING_CONTENT_STATUSES.PUBLISHED]: Object.freeze([
    MARKETING_CONTENT_STATUSES.ARCHIVED,
  ]),
  // Terminal — no legal transition out of ARCHIVED. Reviving the same idea
  // later is deliberately a *new* content row, not a reopened one, so history
  // is never silently rewritten (same reasoning as Career's REJECTED/WITHDRAWN).
  [MARKETING_CONTENT_STATUSES.ARCHIVED]: Object.freeze([]),
});

/** Pure, deterministic, unit-testable in isolation from the adapter that calls it. */
function isValidTransition(from, to) {
  if (!Object.values(MARKETING_CONTENT_STATUSES).includes(to)) return false;
  const allowed = MARKETING_TRANSITIONS[from];
  return Array.isArray(allowed) && allowed.includes(to);
}

module.exports = { MARKETING_TRANSITIONS, isValidTransition };
