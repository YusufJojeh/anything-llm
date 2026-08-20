// Phase N. Code-owned, pure state machine for founder venture status.
// See docs/yusuf-os/gate-b/founder.md's "Why one backward edge" section:
// PAUSED -> BUILDING is the only backward edge (a pause is meant to be
// resumable); LAUNCHED has no backward edge at all.
const FOUNDER_TRANSITIONS = Object.freeze({
  IDEA: Object.freeze(["VALIDATING", "KILLED"]),
  VALIDATING: Object.freeze(["BUILDING", "PAUSED", "KILLED"]),
  BUILDING: Object.freeze(["LAUNCHED", "PAUSED", "KILLED"]),
  LAUNCHED: Object.freeze(["PAUSED", "KILLED"]),
  PAUSED: Object.freeze(["BUILDING", "KILLED"]),
  KILLED: Object.freeze([]),
});

function isValidTransition(from, to) {
  const targets = FOUNDER_TRANSITIONS[from];
  if (!targets) return false;
  return targets.includes(to);
}

module.exports = { FOUNDER_TRANSITIONS, isValidTransition };
