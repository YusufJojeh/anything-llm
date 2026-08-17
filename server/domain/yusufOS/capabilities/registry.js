const { POLICY_OUTCOMES, RISK_LEVELS } = require("../constants");

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value))
    return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

const definition = (value) =>
  deepFreeze({
    version: 1,
    inputSchema: { type: "object", additionalProperties: true },
    targetSemantics: "RESOURCE_SCOPED",
    ...value,
  });

const CAPABILITIES = Object.freeze({
  "core.read_state": definition({
    key: "core.read_state",
    domain: "core",
    description: "Read sanitized Yusuf OS state.",
    operationClass: "READ",
    defaultRisk: RISK_LEVELS.L0,
    defaultOutcome: POLICY_OUTCOMES.ALLOW,
    mutation: false,
    verificationRequired: false,
    idempotency: "SAFE_RETRY",
    hardFlags: [],
  }),
  "core.analyze": definition({
    key: "core.analyze",
    domain: "core",
    description: "Analyze supplied non-secret state without mutation.",
    operationClass: "ANALYZE",
    defaultRisk: RISK_LEVELS.L1,
    defaultOutcome: POLICY_OUTCOMES.ALLOW,
    mutation: false,
    verificationRequired: false,
    idempotency: "SAFE_RETRY",
    hardFlags: [],
  }),
  "core.local_mutation": definition({
    key: "core.local_mutation",
    domain: "core",
    description: "Deterministic local test mutation used to prove Gate C.",
    operationClass: "LOCAL_WRITE",
    defaultRisk: RISK_LEVELS.L2,
    defaultOutcome: POLICY_OUTCOMES.ALLOW,
    mutation: true,
    verificationRequired: true,
    idempotency: "SERVER_KEY",
    hardFlags: [],
  }),
  "core.external_mutation": definition({
    key: "core.external_mutation",
    domain: "core",
    description:
      "Deterministic fake external mutation used to prove approvals.",
    operationClass: "EXTERNAL_MUTATION",
    defaultRisk: RISK_LEVELS.L3,
    defaultOutcome: POLICY_OUTCOMES.REQUIRE_APPROVAL,
    mutation: true,
    verificationRequired: true,
    idempotency: "SERVER_KEY_RECONCILE",
    hardFlags: [],
  }),
  "core.denied": definition({
    key: "core.denied",
    domain: "core",
    description: "A deterministic denied capability used for policy tests.",
    operationClass: "ANALYZE",
    defaultRisk: RISK_LEVELS.L1,
    defaultOutcome: POLICY_OUTCOMES.DENY,
    mutation: false,
    verificationRequired: false,
    idempotency: "NONE",
    hardFlags: [],
  }),
  "git.read_status": definition({
    key: "git.read_status",
    domain: "git",
    description: "Read status from an allowlisted repository.",
    operationClass: "READ",
    defaultRisk: RISK_LEVELS.L0,
    defaultOutcome: POLICY_OUTCOMES.ALLOW,
    mutation: false,
    verificationRequired: false,
    idempotency: "SAFE_RETRY",
    hardFlags: [],
  }),
  "git.read_diff": definition({
    key: "git.read_diff",
    domain: "git",
    description: "Read a scoped diff from an allowlisted repository.",
    operationClass: "READ",
    defaultRisk: RISK_LEVELS.L0,
    defaultOutcome: POLICY_OUTCOMES.ALLOW,
    mutation: false,
    verificationRequired: false,
    idempotency: "SAFE_RETRY",
    hardFlags: [],
  }),
  "git.read_log": definition({
    key: "git.read_log",
    domain: "git",
    description: "Read commit history from an allowlisted repository.",
    operationClass: "READ",
    defaultRisk: RISK_LEVELS.L0,
    defaultOutcome: POLICY_OUTCOMES.ALLOW,
    mutation: false,
    verificationRequired: false,
    idempotency: "SAFE_RETRY",
    hardFlags: [],
  }),
  "git.read_show": definition({
    key: "git.read_show",
    domain: "git",
    description:
      "Read a single commit's contents from an allowlisted repository.",
    operationClass: "READ",
    defaultRisk: RISK_LEVELS.L0,
    defaultOutcome: POLICY_OUTCOMES.ALLOW,
    mutation: false,
    verificationRequired: false,
    idempotency: "SAFE_RETRY",
    hardFlags: [],
  }),
  "git.create_branch": definition({
    key: "git.create_branch",
    domain: "git",
    description: "Create a local feature branch in an allowlisted repository.",
    operationClass: "LOCAL_WRITE",
    defaultRisk: RISK_LEVELS.L2,
    defaultOutcome: POLICY_OUTCOMES.ALLOW,
    mutation: true,
    verificationRequired: true,
    idempotency: "SERVER_KEY",
    hardFlags: [],
  }),
  "git.switch_branch": definition({
    key: "git.switch_branch",
    domain: "git",
    description:
      "Switch the working tree to an existing unprotected local branch.",
    operationClass: "LOCAL_WRITE",
    defaultRisk: RISK_LEVELS.L2,
    defaultOutcome: POLICY_OUTCOMES.ALLOW,
    mutation: true,
    verificationRequired: true,
    idempotency: "SERVER_KEY",
    hardFlags: [],
  }),
  "git.stage_paths": definition({
    key: "git.stage_paths",
    domain: "git",
    description:
      "Stage explicit, allowlisted file paths inside the repository root.",
    operationClass: "LOCAL_WRITE",
    defaultRisk: RISK_LEVELS.L2,
    defaultOutcome: POLICY_OUTCOMES.ALLOW,
    mutation: true,
    verificationRequired: true,
    idempotency: "SERVER_KEY",
    hardFlags: [],
  }),
  "git.commit_local": definition({
    key: "git.commit_local",
    domain: "git",
    description: "Commit scoped files on an unprotected local feature branch.",
    operationClass: "LOCAL_WRITE",
    defaultRisk: RISK_LEVELS.L2,
    defaultOutcome: POLICY_OUTCOMES.ALLOW,
    mutation: true,
    verificationRequired: true,
    idempotency: "SERVER_KEY",
    hardFlags: [],
  }),
  "git.push_feature_branch": definition({
    key: "git.push_feature_branch",
    domain: "git",
    description:
      "Push an exact commit to an unprotected remote feature branch.",
    operationClass: "EXTERNAL_MUTATION",
    defaultRisk: RISK_LEVELS.L3,
    defaultOutcome: POLICY_OUTCOMES.REQUIRE_APPROVAL,
    mutation: true,
    verificationRequired: true,
    idempotency: "SERVER_KEY_RECONCILE",
    hardFlags: [],
  }),
});

const HARD_FORBIDDEN = Object.freeze([
  "credential.extract",
  "browser.cookie.export",
  "browser.session_token.export",
  "private_key.read",
  "policy.bypass",
  "policy.modify_by_agent",
  "approval.modify_by_agent",
  "approval.bypass",
  "audit.modify_history",
  "audit.delete_history",
  "protected_branch.force_push",
  "protected_branch.direct_push",
  "unrestricted_shell_with_secrets",
]);

const HARD_FORBIDDEN_DEFINITIONS = Object.freeze(
  Object.fromEntries(
    HARD_FORBIDDEN.map((key) => [
      key,
      definition({
        key,
        domain: key.split(".")[0],
        description: "A non-approvable Yusuf OS hard security invariant.",
        operationClass: "CRITICAL_OR_DESTRUCTIVE",
        defaultRisk: RISK_LEVELS.L4,
        defaultOutcome: POLICY_OUTCOMES.FORBIDDEN,
        mutation: true,
        verificationRequired: true,
        idempotency: "NEVER_EXECUTE",
        hardFlags: ["HARD_FORBIDDEN"],
      }),
    ])
  )
);

function getCapability(key) {
  return CAPABILITIES[key] || HARD_FORBIDDEN_DEFINITIONS[key] || null;
}

function isHardForbidden(key) {
  return HARD_FORBIDDEN.includes(key);
}

module.exports = {
  CAPABILITIES,
  HARD_FORBIDDEN,
  HARD_FORBIDDEN_DEFINITIONS,
  getCapability,
  isHardForbidden,
};
