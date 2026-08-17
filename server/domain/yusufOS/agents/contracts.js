const { REVIEW_VERDICTS } = require("../constants");
const { YusufOSError, ErrorCodes } = require("../errors/YusufOSError");

const MAX_TEXT = 8000;
const MAX_ITEMS = 50;

/**
 * Structured output contracts for Agent model responses.
 *
 * The rule these encode: model output may describe intent and judgement, but
 * it may never carry authority. Any field that would let prose decide a
 * security or completion outcome — risk level, policy result, approval state,
 * receipt verification, task status, "reviewer said PASS" — is rejected here
 * *before* the value can reach a state transition. What survives validation is
 * only: analysis text, a plan, a requested capability + arguments (which then
 * still cross the Action Boundary), findings, and a verdict that is only
 * meaningful inside a Reviewer-owned run.
 */

// Fields the model is never allowed to set, at any nesting level. Mirrors
// IntentCanonicalizer.AUTHORITY_FIELDS and extends it with Gate E's
// orchestration authority.
const FORBIDDEN_AUTHORITY_FIELDS = Object.freeze([
  "riskLevel",
  "risk",
  "policyResult",
  "policyDecision",
  "policyOutcome",
  "allowed",
  "approved",
  "approvalState",
  "approvalStatus",
  "adapterAuthority",
  "selectedAdapter",
  "idempotencyKey",
  "executionKey",
  "verificationStatus",
  "receiptStatus",
  "taskStatus",
  "runStatus",
  "completed",
  "completionApproved",
  "reviewerVerdict",
  "reviewVerdict",
  "principal",
  "principalType",
  "agentId",
  "reviewerAgentId",
  "capabilityVersion",
]);

function assertNoAuthorityFields(value, path = "$", seen = new WeakSet()) {
  if (!value || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, i) =>
      assertNoAuthorityFields(item, `${path}[${i}]`, seen)
    );
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_AUTHORITY_FIELDS.includes(key))
      throw new YusufOSError(
        ErrorCodes.VALIDATION_ERROR,
        `Agent output may not supply the authority field '${key}'. Security and completion outcomes are decided by the server, not by model text.`,
        { status: 422, details: { field: key, path } }
      );
    assertNoAuthorityFields(nested, `${path}.${key}`, seen);
  }
}

function text(value, field, { max = MAX_TEXT, required = true } = {}) {
  if (value === undefined || value === null) {
    if (required)
      throw new YusufOSError(
        ErrorCodes.VALIDATION_ERROR,
        `${field} is required.`,
        { status: 422, details: { field } }
      );
    return "";
  }
  if (typeof value !== "string")
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `${field} must be a string.`,
      { status: 422, details: { field } }
    );
  if (value.length > max)
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `${field} exceeds the maximum length.`,
      { status: 422, details: { field, max } }
    );
  return value;
}

function stringList(value, field, { max = MAX_ITEMS } = {}) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value))
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `${field} must be an array.`,
      { status: 422, details: { field } }
    );
  if (value.length > max)
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `${field} has too many entries.`,
      { status: 422, details: { field, max } }
    );
  return value.map((item, i) => text(item, `${field}[${i}]`, { max: 2000 }));
}

function parseAgentJson(raw) {
  if (typeof raw === "object" && raw !== null) return raw;
  if (typeof raw !== "string")
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      "Agent output must be JSON.",
      { status: 422 }
    );
  try {
    return JSON.parse(raw);
  } catch {
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      "Agent output is not valid JSON and cannot drive a state transition.",
      { status: 422 }
    );
  }
}

function validate(raw, validator) {
  const parsed = parseAgentJson(raw);
  assertNoAuthorityFields(parsed);
  return validator(parsed);
}

const EngineeringAnalysis = (raw) =>
  validate(raw, (o) => ({
    kind: "EngineeringAnalysis",
    understanding: text(o.understanding, "understanding"),
    affectedPaths: stringList(o.affectedPaths, "affectedPaths"),
    risks: stringList(o.risks, "risks"),
    notes: text(o.notes, "notes", { required: false }),
  }));

const EngineeringPlan = (raw) =>
  validate(raw, (o) => {
    const steps = Array.isArray(o.steps) ? o.steps : [];
    if (steps.length === 0)
      throw new YusufOSError(
        ErrorCodes.VALIDATION_ERROR,
        "EngineeringPlan requires at least one step.",
        { status: 422 }
      );
    if (steps.length > MAX_ITEMS)
      throw new YusufOSError(
        ErrorCodes.VALIDATION_ERROR,
        "EngineeringPlan has too many steps.",
        { status: 422 }
      );
    return {
      kind: "EngineeringPlan",
      summary: text(o.summary, "summary"),
      steps: steps.map((step, i) => ({
        capability: text(step.capability, `steps[${i}].capability`, {
          max: 100,
        }),
        // `arguments` stays an opaque object here on purpose: it is validated
        // for real by the capability's own request builder and then by the
        // Action Boundary. Double-validating shapes here would drift.
        arguments:
          step.arguments &&
          typeof step.arguments === "object" &&
          !Array.isArray(step.arguments)
            ? step.arguments
            : {},
        rationale: text(step.rationale, `steps[${i}].rationale`, {
          max: 2000,
          required: false,
        }),
      })),
    };
  });

const ImplementationEvidence = (raw) =>
  validate(raw, (o) => ({
    kind: "ImplementationEvidence",
    summary: text(o.summary, "summary"),
    changedPaths: stringList(o.changedPaths, "changedPaths"),
    validationCommandKey: text(o.validationCommandKey, "validationCommandKey", {
      max: 100,
      required: false,
    }),
  }));

const ReviewRequest = (raw) =>
  validate(raw, (o) => ({
    kind: "ReviewRequest",
    reason: text(o.reason, "reason", { max: 500 }),
    artifacts: stringList(o.artifacts, "artifacts"),
  }));

const ReviewVerdict = (raw) =>
  validate(raw, (o) => {
    const verdict = text(o.verdict, "verdict", { max: 40 });
    if (!Object.values(REVIEW_VERDICTS).includes(verdict))
      throw new YusufOSError(
        ErrorCodes.VALIDATION_ERROR,
        `verdict must be one of ${Object.values(REVIEW_VERDICTS).join(", ")}.`,
        { status: 422, details: { verdict } }
      );
    const findings = Array.isArray(o.findings) ? o.findings : [];
    if (findings.length > MAX_ITEMS)
      throw new YusufOSError(
        ErrorCodes.VALIDATION_ERROR,
        "Too many findings.",
        { status: 422 }
      );
    return {
      kind: "ReviewVerdict",
      verdict,
      summary: text(o.summary, "summary"),
      findings: findings.map((f, i) => ({
        severity: text(f.severity, `findings[${i}].severity`, { max: 20 }),
        area: text(f.area, `findings[${i}].area`, { max: 60, required: false }),
        detail: text(f.detail, `findings[${i}].detail`, { max: 2000 }),
      })),
    };
  });

const Blocker = (raw) =>
  validate(raw, (o) => ({
    kind: "Blocker",
    reasonCode: text(o.reasonCode, "reasonCode", { max: 60 }),
    detail: text(o.detail, "detail", { max: 2000 }),
  }));

const CompletionAssessment = (raw) =>
  validate(raw, (o) => ({
    kind: "CompletionAssessment",
    // Note this is explicitly *not* a decision — it is the Agent's opinion.
    // CompletionPolicy ignores it and reads persisted state instead.
    claimedComplete: o.claimedComplete === true,
    rationale: text(o.rationale, "rationale", { max: 2000 }),
  }));

module.exports = {
  FORBIDDEN_AUTHORITY_FIELDS,
  assertNoAuthorityFields,
  parseAgentJson,
  EngineeringAnalysis,
  EngineeringPlan,
  ImplementationEvidence,
  ReviewRequest,
  ReviewVerdict,
  Blocker,
  CompletionAssessment,
};
