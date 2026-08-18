/**
 * Code-owned Agent role identity.
 *
 * The single most important rule in this file: **role is identity, status is
 * state, and they never mix.** A role glyph says "this is the Reviewer"; it
 * never says "the Reviewer is busy". Status comes from the projection and is
 * rendered by `statusSemantics.js`. Keeping them apart is what stops a role
 * icon from quietly becoming a fake activity indicator.
 *
 * Roles are keyed by the same code-owned agent keys the backend registry owns
 * (`AGENT_KEYS` in `server/domain/yusufOS/constants.js`). An unknown key is not
 * an error — the roster is allowed to grow — so it falls back to a neutral
 * glyph derived deterministically from the key itself. No colour is assigned
 * per role: colour is reserved for status, so the palette never becomes a
 * rainbow (Gate G.1 §24).
 */

const ROLES = Object.freeze({
  chief_of_staff: { icon: "orchestration", glyph: "CS" },
  engineering: { icon: "engineering", glyph: "EN" },
  reviewer: { icon: "review", glyph: "RV" },
  // Roles the roadmap names but the backend has not registered yet. Listed so
  // that when they do appear they arrive with identity rather than a fallback;
  // they render nothing until the backend actually returns them.
  research: { icon: "research", glyph: "RS" },
  memory: { icon: "memory", glyph: "MM" },
  security: { icon: "security", glyph: "SC" },
  career: { icon: "career", glyph: "CR" },
  marketing: { icon: "marketing", glyph: "MK" },
  sales: { icon: "sales", glyph: "SL" },
  founder: { icon: "founder", glyph: "FN" },
});

/**
 * Two-letter glyph for an unregistered role, derived from the key so it is
 * stable across sessions and never random.
 */
function fallbackGlyph(agentId) {
  const cleaned = String(agentId || "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim();
  if (!cleaned) return "??";
  const words = cleaned.split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return cleaned.slice(0, 2).toUpperCase();
}

export function roleFor(agentId) {
  const known = ROLES[agentId];
  if (known) return { ...known, known: true };
  return { icon: "generic", glyph: fallbackGlyph(agentId), known: false };
}

export const ROLE_KEYS = Object.freeze(Object.keys(ROLES));
