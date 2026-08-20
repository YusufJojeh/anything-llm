// Phase P. Code-owned, pure state machine for inbox message status.
// See docs/yusuf-os/gate-b/sales-inbox.md's transition table. TRIAGED->TRIAGED
// (reclassification) is a self-loop, not a true backward edge — a message
// can be reclassified without ever un-drafting a reply or reviving an
// archived thread. ARCHIVED_LOCAL is the only terminal state.
const INBOX_TRANSITIONS = Object.freeze({
  NEW: Object.freeze(["TRIAGED", "ARCHIVED_LOCAL"]),
  TRIAGED: Object.freeze(["TRIAGED", "DRAFTED", "ARCHIVED_LOCAL"]),
  DRAFTED: Object.freeze(["ARCHIVED_LOCAL"]),
  ARCHIVED_LOCAL: Object.freeze([]),
});

function isValidTransition(from, to) {
  const targets = INBOX_TRANSITIONS[from];
  if (!targets) return false;
  return targets.includes(to);
}

module.exports = { INBOX_TRANSITIONS, isValidTransition };
