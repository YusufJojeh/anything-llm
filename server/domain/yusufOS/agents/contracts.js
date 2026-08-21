const { REVIEW_VERDICTS } = require("../constants");
const { YusufOSError, ErrorCodes } = require("../errors/YusufOSError");

const MAX_TEXT = 8000;
const MAX_ITEMS = 50;
const MAX_DECISION_BYTES = 64 * 1024;
const MAX_DECISION_DEPTH = 20;
const MAX_DECISION_NODES = 2000;
const MAX_CONTAINER_ITEMS = 200;
const AGENT_DECISION_TYPES = Object.freeze({
  CALL_CAPABILITY: "CALL_CAPABILITY",
  HANDOFF: "HANDOFF",
  COMPLETE: "COMPLETE",
  WAIT_FOR_USER: "WAIT_FOR_USER",
  REVIEW_VERDICT: "REVIEW_VERDICT",
});

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

function assertNoAuthorityFields(value, path = "$") {
  if (!value || typeof value !== "object") return;
  const seen = new WeakSet();
  const stack = [{ value, path, depth: 0 }];
  let nodes = 0;
  while (stack.length) {
    const current = stack.pop();
    if (!current.value || typeof current.value !== "object") continue;
    if (seen.has(current.value)) continue;
    seen.add(current.value);
    nodes += 1;
    if (nodes > MAX_DECISION_NODES || current.depth > MAX_DECISION_DEPTH)
      throw new YusufOSError(
        ErrorCodes.VALIDATION_ERROR,
        "Agent output exceeds the structural complexity limit.",
        {
          status: 422,
          details: {
            maxNodes: MAX_DECISION_NODES,
            maxDepth: MAX_DECISION_DEPTH,
          },
        }
      );
    const entries = Array.isArray(current.value)
      ? current.value.map((nested, index) => [index, nested])
      : Object.entries(current.value);
    if (entries.length > MAX_CONTAINER_ITEMS)
      throw new YusufOSError(
        ErrorCodes.VALIDATION_ERROR,
        "Agent output contains an oversized object or array.",
        { status: 422, details: { maxItems: MAX_CONTAINER_ITEMS } }
      );
    for (const [key, nested] of entries) {
      if (
        !Array.isArray(current.value) &&
        FORBIDDEN_AUTHORITY_FIELDS.includes(key)
      )
        throw new YusufOSError(
          ErrorCodes.VALIDATION_ERROR,
          `Agent output may not supply the authority field '${key}'. Security and completion outcomes are decided by the server, not by model text.`,
          { status: 422, details: { field: key, path: current.path } }
        );
      stack.push({
        value: nested,
        path: Array.isArray(current.value)
          ? `${current.path}[${key}]`
          : `${current.path}.${key}`,
        depth: current.depth + 1,
      });
    }
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
  if (typeof raw === "object" && raw !== null) {
    let serialized;
    try {
      serialized = JSON.stringify(raw);
    } catch {
      throw new YusufOSError(
        ErrorCodes.VALIDATION_ERROR,
        "Agent output must be finite JSON data.",
        { status: 422 }
      );
    }
    if (Buffer.byteLength(serialized, "utf8") > MAX_DECISION_BYTES)
      throw new YusufOSError(
        ErrorCodes.VALIDATION_ERROR,
        "Agent output exceeds the maximum decision size.",
        { status: 422, details: { maxBytes: MAX_DECISION_BYTES } }
      );
    return raw;
  }
  if (typeof raw !== "string")
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      "Agent output must be JSON.",
      { status: 422 }
    );
  if (Buffer.byteLength(raw, "utf8") > MAX_DECISION_BYTES)
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      "Agent output exceeds the maximum decision size.",
      { status: 422, details: { maxBytes: MAX_DECISION_BYTES } }
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

function plainObject(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `${field} must be an object.`,
      { status: 422, details: { field } }
    );
  return value;
}

function exactKeys(value, allowed, required, type) {
  const keys = Object.keys(value);
  const unexpected = keys.filter((key) => !allowed.includes(key));
  const missing = required.filter((key) => !keys.includes(key));
  if (unexpected.length || missing.length)
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `${type} does not match the strict decision schema.`,
      { status: 422, details: { unexpected, missing } }
    );
}

/**
 * Phase T's only model-to-runtime contract. It is deliberately closed:
 * unknown decision types, extra fields, markdown fences, and authority
 * claims all fail before orchestration or the Action Boundary sees them.
 */
const AgentDecision = (raw) =>
  validate(raw, (candidate) => {
    const o = plainObject(candidate, "decision");
    const type = text(o.type, "type", { max: 40 });
    if (!Object.values(AGENT_DECISION_TYPES).includes(type))
      throw new YusufOSError(
        ErrorCodes.VALIDATION_ERROR,
        `Unknown Agent decision type: ${type}.`,
        { status: 422, details: { type } }
      );

    if (type === AGENT_DECISION_TYPES.CALL_CAPABILITY) {
      exactKeys(
        o,
        ["type", "capability", "arguments", "reason", "expectedOutcome"],
        ["type", "capability", "arguments", "reason", "expectedOutcome"],
        type
      );
      return {
        type,
        capability: text(o.capability, "capability", { max: 100 }),
        arguments: plainObject(o.arguments, "arguments"),
        reason: text(o.reason, "reason", { max: 2000 }),
        expectedOutcome: text(o.expectedOutcome, "expectedOutcome", {
          max: 2000,
        }),
      };
    }

    if (type === AGENT_DECISION_TYPES.HANDOFF) {
      exactKeys(
        o,
        ["type", "targetAgent", "reason"],
        ["type", "targetAgent", "reason"],
        type
      );
      return {
        type,
        targetAgent: text(o.targetAgent, "targetAgent", { max: 60 }),
        reason: text(o.reason, "reason", { max: 2000 }),
      };
    }

    if (type === AGENT_DECISION_TYPES.COMPLETE) {
      exactKeys(
        o,
        ["type", "summary", "evidenceRefs"],
        ["type", "summary", "evidenceRefs"],
        type
      );
      if (!Array.isArray(o.evidenceRefs))
        throw new YusufOSError(
          ErrorCodes.VALIDATION_ERROR,
          "evidenceRefs must be an array.",
          { status: 422 }
        );
      return {
        type,
        summary: text(o.summary, "summary", { max: 4000 }),
        evidenceRefs: stringList(o.evidenceRefs, "evidenceRefs", { max: 50 }),
      };
    }

    if (type === AGENT_DECISION_TYPES.REVIEW_VERDICT) {
      exactKeys(
        o,
        ["type", "verdict", "summary", "findings"],
        ["type", "verdict", "summary", "findings"],
        type
      );
      if (!Array.isArray(o.findings))
        throw new YusufOSError(
          ErrorCodes.VALIDATION_ERROR,
          "findings must be an array.",
          { status: 422 }
        );
      const review = ReviewVerdict(o);
      return {
        type,
        verdict: review.verdict,
        summary: review.summary,
        findings: review.findings,
      };
    }

    exactKeys(o, ["type", "reason"], ["type", "reason"], type);
    return {
      type,
      reason: text(o.reason, "reason", { max: 2000 }),
    };
  });

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
  MAX_DECISION_BYTES,
  MAX_DECISION_DEPTH,
  MAX_DECISION_NODES,
  AGENT_DECISION_TYPES,
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
  AgentDecision,
};
