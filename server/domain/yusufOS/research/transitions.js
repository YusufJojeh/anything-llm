// Phase O. Code-owned, pure state machine for research item status.
// See docs/yusuf-os/gate-b/research.md's "Why the reopening edge" section:
// ANSWERED -> INVESTIGATING is the one backward edge (a conclusion can later
// prove wrong); ABANDONED is the only true terminal state.
const RESEARCH_TRANSITIONS = Object.freeze({
  OPEN: Object.freeze(["INVESTIGATING", "ABANDONED"]),
  INVESTIGATING: Object.freeze(["ANSWERED", "ABANDONED"]),
  ANSWERED: Object.freeze(["INVESTIGATING", "ABANDONED"]),
  ABANDONED: Object.freeze([]),
});

function isValidTransition(from, to) {
  const targets = RESEARCH_TRANSITIONS[from];
  if (!targets) return false;
  return targets.includes(to);
}

module.exports = { RESEARCH_TRANSITIONS, isValidTransition };
