const { YusufOSError, ErrorCodes } = require("../../errors/YusufOSError");
const { evaluateOrigin } = require("./originPolicy");

/**
 * Code-owned registry of the forms Yusuf OS may submit.
 *
 * This is what keeps `browser.submit_form` a *semantic* capability instead of a generic clicker.
 * A model never supplies a selector, a URL or a field name: it supplies a `formKey`, and the server
 * resolves the exact origin, path, submit control and permitted fields from this file — the same
 * discipline `project.run_command` uses to avoid exposing a shell.
 *
 * Consequences that are deliberate:
 *
 * - **The registry is empty by default.** Yusuf OS ships able to submit nothing at all. A form
 *   appears here only when someone has decided, in code and in review, that an Agent may submit it.
 * - **Fields are allowlisted per form.** A field the descriptor does not name cannot be filled, so a
 *   compromised model cannot smuggle an extra parameter into a submission.
 * - **Every descriptor names a verification signal.** A form with no way to prove the submission
 *   landed does not belong here, because the result could only ever be `EXECUTED_UNVERIFIED`.
 */

/**
 * @typedef {Object} FormDescriptor
 * @property {string} formKey        semantic key an Agent may reference
 * @property {string} origin         exact origin the form must live on
 * @property {RegExp} pathPattern    the page path the form must be on
 * @property {string} submitSelector server-owned; never model-supplied
 * @property {Record<string,{selector:string,maxLength:number}>} fields allowlisted inputs
 * @property {{kind:string,pattern:RegExp}} verification how success is proven
 * @property {string} description    human-readable effect, shown at approval time
 */

/**
 * Production form descriptors.
 *
 * Intentionally empty. Phase I builds and proves the *governance*; wiring a real service form
 * (Gmail reply, LinkedIn post, a job application) is a per-integration decision that belongs with
 * that integration's phase, and each one needs its own review of what submitting it actually does.
 */
const FORMS = Object.freeze({});

// Test-only descriptors, injected explicitly. Never merged into FORMS.
let overrideRegistry = null;

/** @internal test seam — the production path never calls this. */
function __setRegistryForTests(registry) {
  overrideRegistry = registry;
}

function registry() {
  return overrideRegistry || FORMS;
}

function forbidden(message, details = {}) {
  return new YusufOSError(ErrorCodes.ACTION_FORBIDDEN, message, {
    status: 403,
    details,
  });
}

/**
 * Resolves a semantic form key to its server-owned descriptor.
 *
 * An unknown key is forbidden, not improvised — there is no fallback that would let an Agent
 * describe a form Yusuf OS has not agreed to submit.
 */
function resolveForm(formKey) {
  const descriptor = registry()[String(formKey || "")];
  if (!descriptor)
    throw forbidden("No registered form matches that key.", {
      reason: "UNREGISTERED_FORM",
    });
  // Defence in depth: a descriptor whose origin is not observable could never
  // have been read, so it must never be submittable either.
  if (!evaluateOrigin(`${descriptor.origin}/`).allowed)
    throw forbidden("That form's origin is not allowlisted.", {
      reason: "ORIGIN_NOT_ALLOWED",
      origin: descriptor.origin,
    });
  return descriptor;
}

/**
 * Validates model-supplied values against the descriptor's allowlisted fields.
 *
 * Returns a new object containing only permitted fields. An unexpected field is an error rather
 * than something silently dropped: silently dropping it would hide an attempt to submit data the
 * form was never approved to carry.
 */
function assertFieldsAllowed(descriptor, values = {}) {
  const permitted = descriptor.fields || {};
  const supplied = Object.keys(values || {});
  const unknown = supplied.filter((name) => !permitted[name]);
  if (unknown.length)
    throw forbidden("That form does not accept one or more supplied fields.", {
      reason: "FIELD_NOT_ALLOWED",
      fields: unknown,
    });

  const cleaned = {};
  for (const [name, rule] of Object.entries(permitted)) {
    const raw = values[name];
    if (raw === undefined || raw === null) continue;
    if (typeof raw !== "string")
      throw forbidden("Form field values must be strings.", {
        reason: "FIELD_NOT_STRING",
        field: name,
      });
    if (raw.length > rule.maxLength)
      throw forbidden("A form field exceeds its permitted length.", {
        reason: "FIELD_TOO_LONG",
        field: name,
      });
    cleaned[name] = raw;
  }

  const missing = Object.entries(permitted)
    .filter(([name, rule]) => rule.required && !cleaned[name])
    .map(([name]) => name);
  if (missing.length)
    throw forbidden("A required form field is missing.", {
      reason: "FIELD_REQUIRED",
      fields: missing,
    });

  return cleaned;
}

/** Confirms the page the operator is actually on is the page the form lives on. */
function assertPageMatchesForm(descriptor, url) {
  let parsed;
  try {
    parsed = new URL(String(url));
  } catch {
    throw forbidden("The current page URL could not be parsed.", {
      reason: "UNPARSEABLE_URL",
    });
  }
  if (parsed.origin !== descriptor.origin)
    throw forbidden("The tab is not on the form's origin.", {
      reason: "ORIGIN_MISMATCH",
      expected: descriptor.origin,
      actual: parsed.origin,
    });
  if (!descriptor.pathPattern.test(parsed.pathname))
    throw forbidden("The tab is not on the form's page.", {
      reason: "PATH_MISMATCH",
      actual: parsed.pathname,
    });
  return true;
}

module.exports = {
  FORMS,
  resolveForm,
  assertFieldsAllowed,
  assertPageMatchesForm,
  __setRegistryForTests,
};
