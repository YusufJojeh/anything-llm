const { redactString } = require("../../security/redaction");
const { sha256 } = require("../../security/canonicalJson");
const { safeUrl } = require("./originPolicy");

/**
 * Turns whatever a web page contains into inert, attributed data.
 *
 * This is the security centre of the Browser Broker. A page is written by someone who is not
 * Yusuf, and it will end up inside a model's context, so it is treated exactly like any other
 * hostile input:
 *
 * - **it is never authority.** Nothing a page says can change policy, approve an action, assert an
 *   account identity, or alter a system prompt. The envelope marks it `UNTRUSTED_WEB_CONTENT`, and
 *   the agent-facing contract layer already rejects authority-bearing fields from model output;
 * - **hidden text is separated, not silently included.** The classic injection is white-on-white or
 *   `display:none` instructions. We surface it in its own field, flagged, so a summary that quotes
 *   it is visibly quoting something a human could not see;
 * - **known injection phrasings are counted, not obeyed** — a signal for the operator and for
 *   review, never a filter we claim is complete;
 * - **secret-shaped strings are redacted** with the same `redactString` used for receipts and
 *   audit metadata;
 * - **everything is bounded.** A page cannot exhaust context or storage.
 */

// Caps are deliberately modest: this is operator context, not a scraper.
const MAX_VISIBLE_TEXT = 20000;
const MAX_HIDDEN_TEXT = 4000;
const MAX_TITLE = 300;
const MAX_ITEMS = 100;
const MAX_ITEM_TEXT = 300;

const PROVENANCE = "UNTRUSTED_WEB_CONTENT";

/**
 * Phrasings that keep showing up in real prompt-injection attempts. Matching one does not change
 * what we return — the content is inert either way. It raises a counter the operator can see, and
 * it is explicitly *not* presented as a filter: treating this list as a defence would be the
 * mistake.
 */
const INJECTION_MARKERS = Object.freeze([
  /ignore (?:all |any )?(?:previous|prior|above) instructions/i,
  /disregard (?:all |any )?(?:previous|prior|above)/i,
  /you are now (?:a|an|in)/i,
  /system prompt/i,
  /developer mode/i,
  /reveal (?:your |the )?(?:prompt|instructions|secret|api key)/i,
  /\bapprove\b[^.]{0,40}\b(?:this|the)\b[^.]{0,40}\b(?:action|request|payment)/i,
  /disable (?:the )?(?:policy|safety|guardrail|approval)/i,
  /run (?:the following|this) (?:shell|command|script)/i,
  /export (?:cookies|session|token|credentials)/i,
]);

function clamp(value, max) {
  const text = typeof value === "string" ? value : "";
  const collapsed = text
    .replace(/[ \t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return collapsed.length > max
    ? `${collapsed.slice(0, max)}…[truncated]`
    : collapsed;
}

/** Redact first, then clamp: never truncate a secret into looking harmless. */
function clean(value, max) {
  if (value === null || value === undefined) return "";
  return clamp(redactString(String(value)), max);
}

function countInjectionMarkers(...texts) {
  const haystack = texts.filter(Boolean).join("\n");
  let matches = 0;
  for (const pattern of INJECTION_MARKERS)
    if (pattern.test(haystack)) matches += 1;
  return matches;
}

function sanitizeItems(items, mapper) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, MAX_ITEMS).map(mapper).filter(Boolean);
}

/**
 * Builds the sanitized, attributed page state.
 *
 * `raw` is whatever a driver extracted. Drivers are trusted to *collect* honestly; they are not
 * trusted to have sanitized anything, so every field is cleaned here regardless of source.
 */
function sanitizePageState(raw = {}, { includeHidden = true } = {}) {
  const url = safeUrl(raw.url);
  const visibleText = clean(raw.visibleText, MAX_VISIBLE_TEXT);
  const hiddenText = includeHidden
    ? clean(raw.hiddenText, MAX_HIDDEN_TEXT)
    : "";

  const headings = sanitizeItems(raw.headings, (heading) => {
    const text = clean(heading?.text, MAX_ITEM_TEXT);
    if (!text) return null;
    return { level: Number(heading?.level) || 0, text };
  });

  const links = sanitizeItems(raw.links, (link) => {
    const text = clean(link?.text, MAX_ITEM_TEXT);
    const href = safeUrl(link?.href);
    // A link with no resolvable destination is noise; a link whose destination
    // we cannot express safely is worse than omitting it.
    if (!href) return null;
    return { text, href, crossOrigin: Boolean(link?.crossOrigin) };
  });

  const landmarks = sanitizeItems(raw.landmarks, (landmark) => {
    const role = clean(landmark?.role, 40);
    if (!role) return null;
    return { role, label: clean(landmark?.label, MAX_ITEM_TEXT) };
  });

  const injectionMarkers = countInjectionMarkers(visibleText, hiddenText);

  return {
    provenance: PROVENANCE,
    url,
    title: clean(raw.title, MAX_TITLE),
    capturedAt: new Date().toISOString(),
    visibleText,
    // Kept separate on purpose: text a human could not see is a different kind
    // of claim from text they could.
    hiddenText,
    hasHiddenText: hiddenText.length > 0,
    headings,
    links,
    landmarks,
    frameCount: Number.isInteger(raw.frameCount) ? raw.frameCount : 0,
    // An iframe means part of what the operator sees was authored by a third
    // origin. Surfaced so a summary can say so.
    hasCrossOriginFrames: Boolean(raw.hasCrossOriginFrames),
    injectionMarkers,
    // The digest covers exactly what we returned, so a later read can prove the
    // page changed underneath us (Phase I preflight depends on this).
    contentDigest: sha256(
      JSON.stringify({ url, visibleText, hiddenText, headings, links })
    ),
    truncated:
      visibleText.endsWith("…[truncated]") ||
      hiddenText.endsWith("…[truncated]"),
  };
}

/**
 * Safe account identity.
 *
 * Deliberately narrow. A page can display any name it likes, so a label read from the DOM is
 * *reported* as an unverified hint and never treated as proof of identity. The only thing that
 * counts as authenticated is a signal the driver obtained from the browser session itself.
 */
function sanitizeAccountIdentity(raw = {}) {
  const label = clean(raw.accountLabel, 200);
  return {
    provenance: PROVENANCE,
    origin: raw.origin ? String(raw.origin) : null,
    // `authenticated` | `unauthenticated` | `unknown` — never a credential.
    state:
      raw.state === "authenticated" || raw.state === "unauthenticated"
        ? raw.state
        : "unknown",
    accountLabel: label || null,
    // True only when the state came from the session rather than page text.
    verifiedBySession: raw.verifiedBySession === true,
    capturedAt: new Date().toISOString(),
  };
}

module.exports = {
  PROVENANCE,
  MAX_VISIBLE_TEXT,
  MAX_HIDDEN_TEXT,
  INJECTION_MARKERS,
  sanitizePageState,
  sanitizeAccountIdentity,
  countInjectionMarkers,
};
