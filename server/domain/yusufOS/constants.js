const PRINCIPAL_TYPES = Object.freeze({
  USER: "USER",
  AGENT: "AGENT",
  SCHEDULE: "SCHEDULE",
  SYSTEM: "SYSTEM",
});

const TASK_STATUSES = Object.freeze({
  PLANNED: "PLANNED",
  READY: "READY",
  RUNNING: "RUNNING",
  BLOCKED: "BLOCKED",
  WAITING_APPROVAL: "WAITING_APPROVAL",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
});

const RUN_STATUSES = Object.freeze({
  QUEUED: "QUEUED",
  RUNNING: "RUNNING",
  WAITING_TOOL: "WAITING_TOOL",
  WAITING_APPROVAL: "WAITING_APPROVAL",
  WAITING_HANDOFF: "WAITING_HANDOFF",
  WAITING_DEPENDENCY: "WAITING_DEPENDENCY",
  BLOCKED: "BLOCKED",
  VERIFYING: "VERIFYING",
  FAILED: "FAILED",
  FAILED_UNKNOWN: "FAILED_UNKNOWN",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
});

// Gate E: distinguishes *why* a run ended so a future Command Center can show
// a meaningful state instead of collapsing everything into FAILED.
const RUN_FAILURE_KINDS = Object.freeze({
  AGENT_REASONING: "AGENT_REASONING",
  CONTRACT_VIOLATION: "CONTRACT_VIOLATION",
  TOOL_EXECUTION: "TOOL_EXECUTION",
  EXTERNAL_UNKNOWN: "EXTERNAL_UNKNOWN",
  REVIEW_BLOCKED: "REVIEW_BLOCKED",
  APPROVAL_REJECTED: "APPROVAL_REJECTED",
  DEPENDENCY_BLOCKED: "DEPENDENCY_BLOCKED",
  MODEL_UNAVAILABLE: "MODEL_UNAVAILABLE",
  POLICY_DENIED: "POLICY_DENIED",
});

const RUN_KINDS = Object.freeze({
  ORCHESTRATION: "ORCHESTRATION",
  IMPLEMENTATION: "IMPLEMENTATION",
  REVIEW: "REVIEW",
  EXECUTION: "EXECUTION",
});

const AGENT_KEYS = Object.freeze({
  CHIEF_OF_STAFF: "chief_of_staff",
  ENGINEERING: "engineering",
  REVIEWER: "reviewer",
  MONITORING: "monitoring",
  CAREER: "career",
  MARKETING: "marketing",
  FOUNDER: "founder",
  RESEARCH: "research",
  INBOX: "inbox",
});

const DEPARTMENT_KEYS = Object.freeze({
  SYSTEM_CORE: "system_core",
  ENGINEERING: "engineering",
  MONITORING: "monitoring",
  CAREER: "career",
  MARKETING: "marketing",
  FOUNDER: "founder",
  RESEARCH: "research",
  SALES: "sales",
});

// Orchestration-only label describing how freely an Agent may plan/delegate
// its own work. Never consulted by PolicyEngine/ApprovalService/the
// capability registry — approval requirements are owned entirely by
// capabilities/registry.js. See docs/yusuf-os/gate-b/organization-model.md.
const AUTONOMY_LEVELS = Object.freeze({
  MANUAL: "MANUAL",
  SUPERVISED: "SUPERVISED",
  AUTONOMOUS: "AUTONOMOUS",
});

const REVIEW_VERDICTS = Object.freeze({
  PASS: "PASS",
  PASS_WITH_WARNINGS: "PASS_WITH_WARNINGS",
  BLOCK: "BLOCK",
});

const HANDOFF_STATUSES = Object.freeze({
  PENDING: "PENDING",
  ACCEPTED: "ACCEPTED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
});

const EVIDENCE_KINDS = Object.freeze({
  ANALYSIS: "ANALYSIS",
  IMPLEMENTATION: "IMPLEMENTATION",
  VALIDATION: "VALIDATION",
});

// Phase J / ADR-008. SECRET_FORBIDDEN is a valid classification value only so
// recordEvidence() can name the refusal reason — nothing is ever persisted at
// this class. Ordered least- to most-sensitive; EVIDENCE_RETENTION_DAYS below
// intentionally shortens as sensitivity rises.
const EVIDENCE_CLASSES = Object.freeze({
  PUBLIC_METADATA: "PUBLIC_METADATA",
  SANITIZED_OUTPUT: "SANITIZED_OUTPUT",
  SENSITIVE_OPERATIONAL: "SENSITIVE_OPERATIONAL",
  SCREENSHOT: "SCREENSHOT",
  SECRET_FORBIDDEN: "SECRET_FORBIDDEN",
});

const EVIDENCE_RETENTION_DAYS = Object.freeze({
  PUBLIC_METADATA: 365,
  SANITIZED_OUTPUT: 180,
  SENSITIVE_OPERATIONAL: 30,
  SCREENSHOT: 14,
});

// Phase J. PERSONAL is reachable only by a USER principal — enforced in
// adapters/memory/MemoryAdapter.js, not here; this is just the vocabulary.
const MEMORY_SCOPES = Object.freeze({
  PERSONAL: "PERSONAL",
  PROJECT: "PROJECT",
  AGENT: "AGENT",
  TASK: "TASK",
  CONVERSATION: "CONVERSATION",
});

const KNOWLEDGE_SOURCE_TYPES = Object.freeze({
  AGENT_DERIVED: "AGENT_DERIVED",
  USER_PROVIDED: "USER_PROVIDED",
  DOCUMENT_CITED: "DOCUMENT_CITED",
});

// Phase K. Code-owned registry of check keys `monitoring.record_check`
// accepts — a model supplies only the key, never the verdict. See
// docs/yusuf-os/gate-b/monitoring.md.
const MONITORING_CHECK_KEYS = Object.freeze({
  SYSTEM_HEALTH: "SYSTEM_HEALTH",
});

const MONITORING_CHECK_STATUSES = Object.freeze({
  OK: "OK",
  WARN: "WARN",
  BREACH: "BREACH",
});

// Phase L. A new opportunity always starts RESEARCHING (career.record_opportunity
// refuses any other initial value) so every real transition passes through the
// code-owned transition table in career/transitions.js. See
// docs/yusuf-os/gate-b/career.md.
const CAREER_OPPORTUNITY_STATUSES = Object.freeze({
  RESEARCHING: "RESEARCHING",
  APPLIED: "APPLIED",
  INTERVIEWING: "INTERVIEWING",
  OFFER: "OFFER",
  REJECTED: "REJECTED",
  WITHDRAWN: "WITHDRAWN",
});

// Phase M. A new content item always starts IDEA (marketing.record_content
// refuses any other initial value), same discipline as Career's RESEARCHING
// start. See docs/yusuf-os/gate-b/marketing.md.
const MARKETING_CONTENT_STATUSES = Object.freeze({
  IDEA: "IDEA",
  DRAFTING: "DRAFTING",
  READY_FOR_REVIEW: "READY_FOR_REVIEW",
  SCHEDULED: "SCHEDULED",
  PUBLISHED: "PUBLISHED",
  ARCHIVED: "ARCHIVED",
});

// Phase N. A new venture always starts IDEA (founder.record_venture refuses
// any other initial value), same discipline as Career/Marketing's forced
// starts. See docs/yusuf-os/gate-b/founder.md.
const FOUNDER_VENTURE_STATUSES = Object.freeze({
  IDEA: "IDEA",
  VALIDATING: "VALIDATING",
  BUILDING: "BUILDING",
  LAUNCHED: "LAUNCHED",
  PAUSED: "PAUSED",
  KILLED: "KILLED",
});

// Phase O. A new research item always starts OPEN (research.record_item
// refuses any other initial value), same discipline as every prior tracking
// phase's forced start. See docs/yusuf-os/gate-b/research.md.
const RESEARCH_ITEM_STATUSES = Object.freeze({
  OPEN: "OPEN",
  INVESTIGATING: "INVESTIGATING",
  ANSWERED: "ANSWERED",
  ABANDONED: "ABANDONED",
});

// Phase P. A new inbox message always starts NEW (inbox.record_message
// refuses any other initial value), same discipline as every prior tracking
// phase's forced start. See docs/yusuf-os/gate-b/sales-inbox.md.
const INBOX_MESSAGE_STATUSES = Object.freeze({
  NEW: "NEW",
  TRIAGED: "TRIAGED",
  DRAFTED: "DRAFTED",
  ARCHIVED_LOCAL: "ARCHIVED_LOCAL",
});

// Phase P. A closed vocabulary the model asserts a judgment from — the same
// trust tier as Knowledge's asserted facts, never a state-machine status.
const INBOX_CLASSIFICATIONS = Object.freeze({
  OPPORTUNITY: "OPPORTUNITY",
  INTERVIEW: "INTERVIEW",
  REJECTION: "REJECTION",
  BOUNCE: "BOUNCE",
  OTHER: "OTHER",
});

const INTENT_STATUSES = Object.freeze({
  INTENT_CREATED: "INTENT_CREATED",
  POLICY_EVALUATED: "POLICY_EVALUATED",
  POLICY_DENIED: "POLICY_DENIED",
  FORBIDDEN: "FORBIDDEN",
  WAITING_APPROVAL: "WAITING_APPROVAL",
  AUTHORIZED: "AUTHORIZED",
  EXECUTING: "EXECUTING",
  EXECUTED_UNVERIFIED: "EXECUTED_UNVERIFIED",
  VERIFIED: "VERIFIED",
  FAILED: "FAILED",
  FAILED_UNKNOWN: "FAILED_UNKNOWN",
  INVALIDATED: "INVALIDATED",
  CANCELLED: "CANCELLED",
});

const APPROVAL_STATUSES = Object.freeze({
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  EXPIRED: "EXPIRED",
  INVALIDATED: "INVALIDATED",
  CONSUMED: "CONSUMED",
});

const POLICY_OUTCOMES = Object.freeze({
  ALLOW: "ALLOW",
  REQUIRE_APPROVAL: "REQUIRE_APPROVAL",
  DENY: "DENY",
  FORBIDDEN: "FORBIDDEN",
});

const RISK_LEVELS = Object.freeze({
  L0: "L0",
  L1: "L1",
  L2: "L2",
  L3: "L3",
  L4: "L4",
});

const SECURITY_SETTING_KEYS = Object.freeze({
  EXTERNAL_MUTATIONS_DISABLED: "EXTERNAL_MUTATIONS_DISABLED",
});

module.exports = {
  PRINCIPAL_TYPES,
  TASK_STATUSES,
  RUN_STATUSES,
  RUN_FAILURE_KINDS,
  RUN_KINDS,
  AGENT_KEYS,
  DEPARTMENT_KEYS,
  AUTONOMY_LEVELS,
  REVIEW_VERDICTS,
  HANDOFF_STATUSES,
  EVIDENCE_KINDS,
  EVIDENCE_CLASSES,
  EVIDENCE_RETENTION_DAYS,
  MEMORY_SCOPES,
  KNOWLEDGE_SOURCE_TYPES,
  MONITORING_CHECK_KEYS,
  MONITORING_CHECK_STATUSES,
  CAREER_OPPORTUNITY_STATUSES,
  MARKETING_CONTENT_STATUSES,
  FOUNDER_VENTURE_STATUSES,
  RESEARCH_ITEM_STATUSES,
  INBOX_MESSAGE_STATUSES,
  INBOX_CLASSIFICATIONS,
  INTENT_STATUSES,
  APPROVAL_STATUSES,
  POLICY_OUTCOMES,
  RISK_LEVELS,
  SECURITY_SETTING_KEYS,
};
