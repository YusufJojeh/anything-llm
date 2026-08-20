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
  "project.read_file": definition({
    key: "project.read_file",
    domain: "project",
    description:
      "Read one allowlisted, non-secret file inside a bound project root.",
    operationClass: "READ",
    defaultRisk: RISK_LEVELS.L0,
    defaultOutcome: POLICY_OUTCOMES.ALLOW,
    mutation: false,
    verificationRequired: false,
    idempotency: "SAFE_RETRY",
    hardFlags: [],
  }),
  "project.write_file": definition({
    key: "project.write_file",
    domain: "project",
    description:
      "Replace the contents of one allowlisted, non-secret file inside a bound project root.",
    operationClass: "LOCAL_WRITE",
    defaultRisk: RISK_LEVELS.L2,
    defaultOutcome: POLICY_OUTCOMES.ALLOW,
    mutation: true,
    verificationRequired: true,
    idempotency: "SERVER_KEY",
    hardFlags: [],
  }),
  "project.run_command": definition({
    key: "project.run_command",
    domain: "project",
    description:
      "Run one project-registered, server-owned command by its semantic key. Never a model-supplied shell string.",
    operationClass: "LOCAL_WRITE",
    defaultRisk: RISK_LEVELS.L2,
    defaultOutcome: POLICY_OUTCOMES.ALLOW,
    mutation: true,
    verificationRequired: true,
    idempotency: "SERVER_KEY",
    hardFlags: [],
  }),

  // --- Phase H: Browser Broker, read-only -------------------------------
  // Every one of these is `mutation: false`. There is deliberately no click,
  // type, submit, navigate or evaluate capability: browser mutation is Phase I
  // and arrives as *semantic* capabilities (gmail.send_reply), never as a
  // generic clicker. See ADR-011 and adapter-governance.md §2.
  "browser.list_tabs": definition({
    key: "browser.list_tabs",
    domain: "browser",
    description:
      "List open browser tabs whose origin is on the Yusuf OS allowlist.",
    operationClass: "READ",
    defaultRisk: RISK_LEVELS.L0,
    defaultOutcome: POLICY_OUTCOMES.ALLOW,
    mutation: false,
    verificationRequired: false,
    idempotency: "SAFE_RETRY",
    hardFlags: [],
  }),
  "browser.get_current_url": definition({
    key: "browser.get_current_url",
    domain: "browser",
    description:
      "Read the origin and path of an allowlisted tab. Query and fragment are stripped.",
    operationClass: "READ",
    defaultRisk: RISK_LEVELS.L0,
    defaultOutcome: POLICY_OUTCOMES.ALLOW,
    mutation: false,
    verificationRequired: false,
    idempotency: "SAFE_RETRY",
    hardFlags: [],
  }),
  "browser.get_active_account_identity": definition({
    key: "browser.get_active_account_identity",
    domain: "browser",
    description:
      "Report whether an allowlisted origin has an authenticated session. Never a credential.",
    operationClass: "ANALYZE",
    defaultRisk: RISK_LEVELS.L1,
    defaultOutcome: POLICY_OUTCOMES.ALLOW,
    mutation: false,
    verificationRequired: false,
    idempotency: "SAFE_RETRY",
    hardFlags: [],
  }),
  "browser.read_visible_text": definition({
    key: "browser.read_visible_text",
    domain: "browser",
    description:
      "Read sanitized visible text from an allowlisted page as untrusted content.",
    operationClass: "ANALYZE",
    defaultRisk: RISK_LEVELS.L1,
    defaultOutcome: POLICY_OUTCOMES.ALLOW,
    mutation: false,
    verificationRequired: false,
    idempotency: "SAFE_RETRY",
    hardFlags: [],
  }),
  "browser.read_structured_page": definition({
    key: "browser.read_structured_page",
    domain: "browser",
    description:
      "Read sanitized headings, links and landmarks from an allowlisted page.",
    operationClass: "ANALYZE",
    defaultRisk: RISK_LEVELS.L1,
    defaultOutcome: POLICY_OUTCOMES.ALLOW,
    mutation: false,
    verificationRequired: false,
    idempotency: "SAFE_RETRY",
    hardFlags: [],
  }),
  "browser.capture_safe_page_state": definition({
    key: "browser.capture_safe_page_state",
    domain: "browser",
    description:
      "Capture the full sanitized page state, including a content digest, from an allowlisted page.",
    operationClass: "ANALYZE",
    defaultRisk: RISK_LEVELS.L1,
    defaultOutcome: POLICY_OUTCOMES.ALLOW,
    mutation: false,
    verificationRequired: false,
    idempotency: "SAFE_RETRY",
    hardFlags: [],
  }),

  // --- Phase I: governed browser mutation ---------------------------------
  // The single mutation capability the Browser Broker exposes. It is not a
  // clicker: a model supplies only a server-owned `formKey` and allowlisted
  // field values (see adapters/browser/formRegistry.js); the origin, page,
  // submit control and permitted fields all come from a code-owned
  // descriptor. Real forms (Gmail reply, LinkedIn post, ...) are added to
  // that registry one integration at a time — the registry ships empty.
  "browser.submit_form": definition({
    key: "browser.submit_form",
    domain: "browser",
    description:
      "Submit one server-registered browser form by its semantic key, with allowlisted field values.",
    operationClass: "EXTERNAL_MUTATION",
    defaultRisk: RISK_LEVELS.L3,
    defaultOutcome: POLICY_OUTCOMES.REQUIRE_APPROVAL,
    mutation: true,
    verificationRequired: true,
    idempotency: "SERVER_KEY_RECONCILE",
    hardFlags: [],
  }),

  // --- Phase J: Knowledge + Memory ----------------------------------------
  // Both are internal, reversible writes to Yusuf OS's own database with no
  // external blast radius — the same tier as project.write_file, one step
  // below git.push_feature_branch's L3. See
  // docs/yusuf-os/gate-b/knowledge-evidence-memory.md.
  "knowledge.read": definition({
    key: "knowledge.read",
    domain: "knowledge",
    description: "Read curated Knowledge entries by uuid or tag.",
    operationClass: "READ",
    defaultRisk: RISK_LEVELS.L0,
    defaultOutcome: POLICY_OUTCOMES.ALLOW,
    mutation: false,
    verificationRequired: false,
    idempotency: "SAFE_RETRY",
    hardFlags: [],
  }),
  "knowledge.write": definition({
    key: "knowledge.write",
    domain: "knowledge",
    description: "Record a curated Knowledge entry.",
    operationClass: "LOCAL_WRITE",
    defaultRisk: RISK_LEVELS.L1,
    defaultOutcome: POLICY_OUTCOMES.ALLOW,
    mutation: true,
    verificationRequired: true,
    idempotency: "SERVER_KEY",
    hardFlags: [],
  }),
  "memory.read": definition({
    key: "memory.read",
    domain: "memory",
    description:
      "Read a scoped Memory entry. Scope ownership is enforced adapter-side.",
    operationClass: "READ",
    defaultRisk: RISK_LEVELS.L0,
    defaultOutcome: POLICY_OUTCOMES.ALLOW,
    mutation: false,
    verificationRequired: false,
    idempotency: "SAFE_RETRY",
    hardFlags: [],
  }),
  "memory.write": definition({
    key: "memory.write",
    domain: "memory",
    description:
      "Write (upsert) a scoped Memory entry. Scope ownership is enforced adapter-side; PERSONAL scope is never reachable by an Agent.",
    operationClass: "LOCAL_WRITE",
    defaultRisk: RISK_LEVELS.L1,
    defaultOutcome: POLICY_OUTCOMES.ALLOW,
    mutation: true,
    verificationRequired: true,
    idempotency: "SERVER_KEY",
    hardFlags: [],
  }),

  // --- Phase K: Monitoring -------------------------------------------------
  // A read of Yusuf OS's own internal state, and an append-only record of a
  // check against it. Both stay internal-effect only; nothing here can reach
  // outside Yusuf OS's own database. See docs/yusuf-os/gate-b/monitoring.md.
  "system.read_health": definition({
    key: "system.read_health",
    domain: "system",
    description:
      "Read Yusuf OS's own internal health signals (approval backlog, unresolved intents, control-plane and kill-switch state).",
    operationClass: "READ",
    defaultRisk: RISK_LEVELS.L0,
    defaultOutcome: POLICY_OUTCOMES.ALLOW,
    mutation: false,
    verificationRequired: false,
    idempotency: "SAFE_RETRY",
    hardFlags: [],
  }),
  "monitoring.record_check": definition({
    key: "monitoring.record_check",
    domain: "monitoring",
    description:
      "Record one Monitoring check by its registered key. Status/observed value/threshold are always server-derived, never a caller's claim.",
    operationClass: "LOCAL_WRITE",
    defaultRisk: RISK_LEVELS.L1,
    defaultOutcome: POLICY_OUTCOMES.ALLOW,
    mutation: true,
    verificationRequired: true,
    idempotency: "SERVER_KEY",
    hardFlags: [],
  }),

  // --- Phase L: Career -----------------------------------------------------
  // Durable tracking of job opportunities Yusuf is pursuing. Internal-effect
  // only — no auto-apply, no email/job-board mutation (that needs the Browser
  // Broker and a real integration, deferred). See docs/yusuf-os/gate-b/career.md.
  "career.read_opportunities": definition({
    key: "career.read_opportunities",
    domain: "career",
    description: "Read career opportunities by uuid or status.",
    operationClass: "READ",
    defaultRisk: RISK_LEVELS.L0,
    defaultOutcome: POLICY_OUTCOMES.ALLOW,
    mutation: false,
    verificationRequired: false,
    idempotency: "SAFE_RETRY",
    hardFlags: [],
  }),
  "career.record_opportunity": definition({
    key: "career.record_opportunity",
    domain: "career",
    description:
      "Record a new career opportunity. Always starts at status RESEARCHING.",
    operationClass: "LOCAL_WRITE",
    defaultRisk: RISK_LEVELS.L1,
    defaultOutcome: POLICY_OUTCOMES.ALLOW,
    mutation: true,
    verificationRequired: true,
    idempotency: "SERVER_KEY",
    hardFlags: [],
  }),
  "career.update_status": definition({
    key: "career.update_status",
    domain: "career",
    description:
      "Transition an existing career opportunity's status. Illegal transitions are refused by a code-owned transition table.",
    operationClass: "LOCAL_WRITE",
    defaultRisk: RISK_LEVELS.L1,
    defaultOutcome: POLICY_OUTCOMES.ALLOW,
    mutation: true,
    verificationRequired: true,
    idempotency: "SERVER_KEY",
    hardFlags: [],
  }),
  // Phase Q, docs/yusuf-os/gate-b/application-submission.md. A local-only
  // draft, distinct from career.update_status: it never changes status by
  // itself, so an opportunity can carry prepared application content while
  // still sitting at RESEARCHING until a real submission (browser.submit_form,
  // L3, requires approval) actually succeeds and update_status moves it to
  // APPLIED. This is the "Needs Yusuf" checkpoint the end-to-end scenario
  // describes — nothing external happens from this capability alone.
  "career.prepare_application": definition({
    key: "career.prepare_application",
    domain: "career",
    description:
      "Store a local-only application draft (notes) on an existing career opportunity. Never submits anything and never changes status.",
    operationClass: "LOCAL_WRITE",
    defaultRisk: RISK_LEVELS.L1,
    defaultOutcome: POLICY_OUTCOMES.ALLOW,
    mutation: true,
    verificationRequired: true,
    idempotency: "SERVER_KEY",
    hardFlags: [],
  }),

  // --- Phase M: Marketing --------------------------------------------------
  // Durable tracking of marketing content Yusuf is producing. Internal-effect
  // only — no real posting to any channel (that needs the Browser Broker and a
  // real per-service form registration, deferred). PUBLISHED here is Yusuf/an
  // Agent asserting content went live elsewhere, not Yusuf OS verifying it —
  // see docs/yusuf-os/gate-b/marketing.md.
  "marketing.read_content": definition({
    key: "marketing.read_content",
    domain: "marketing",
    description: "Read marketing content items by uuid or status.",
    operationClass: "READ",
    defaultRisk: RISK_LEVELS.L0,
    defaultOutcome: POLICY_OUTCOMES.ALLOW,
    mutation: false,
    verificationRequired: false,
    idempotency: "SAFE_RETRY",
    hardFlags: [],
  }),
  "marketing.record_content": definition({
    key: "marketing.record_content",
    domain: "marketing",
    description:
      "Record a new marketing content item. Always starts at status IDEA.",
    operationClass: "LOCAL_WRITE",
    defaultRisk: RISK_LEVELS.L1,
    defaultOutcome: POLICY_OUTCOMES.ALLOW,
    mutation: true,
    verificationRequired: true,
    idempotency: "SERVER_KEY",
    hardFlags: [],
  }),
  "marketing.update_status": definition({
    key: "marketing.update_status",
    domain: "marketing",
    description:
      "Transition an existing marketing content item's status. Illegal transitions are refused by a code-owned transition table.",
    operationClass: "LOCAL_WRITE",
    defaultRisk: RISK_LEVELS.L1,
    defaultOutcome: POLICY_OUTCOMES.ALLOW,
    mutation: true,
    verificationRequired: true,
    idempotency: "SERVER_KEY",
    hardFlags: [],
  }),

  // --- Phase N: Founder ------------------------------------------------------
  // Durable tracking of side-project ventures Yusuf is running. Pipeline state
  // only — no financial/investment tracking, no legal automation. See
  // docs/yusuf-os/gate-b/founder.md.
  "founder.read_ventures": definition({
    key: "founder.read_ventures",
    domain: "founder",
    description: "Read founder ventures by uuid or status.",
    operationClass: "READ",
    defaultRisk: RISK_LEVELS.L0,
    defaultOutcome: POLICY_OUTCOMES.ALLOW,
    mutation: false,
    verificationRequired: false,
    idempotency: "SAFE_RETRY",
    hardFlags: [],
  }),
  "founder.record_venture": definition({
    key: "founder.record_venture",
    domain: "founder",
    description: "Record a new founder venture. Always starts at status IDEA.",
    operationClass: "LOCAL_WRITE",
    defaultRisk: RISK_LEVELS.L1,
    defaultOutcome: POLICY_OUTCOMES.ALLOW,
    mutation: true,
    verificationRequired: true,
    idempotency: "SERVER_KEY",
    hardFlags: [],
  }),
  "founder.update_status": definition({
    key: "founder.update_status",
    domain: "founder",
    description:
      "Transition an existing founder venture's status. Illegal transitions are refused by a code-owned transition table.",
    operationClass: "LOCAL_WRITE",
    defaultRisk: RISK_LEVELS.L1,
    defaultOutcome: POLICY_OUTCOMES.ALLOW,
    mutation: true,
    verificationRequired: true,
    idempotency: "SERVER_KEY",
    hardFlags: [],
  }),

  // --- Phase O: Research ------------------------------------------------------
  // Durable tracking of research questions Yusuf is investigating. Pipeline
  // state only — no automated browsing/search execution. See
  // docs/yusuf-os/gate-b/research.md.
  "research.read_items": definition({
    key: "research.read_items",
    domain: "research",
    description: "Read research items by uuid or status.",
    operationClass: "READ",
    defaultRisk: RISK_LEVELS.L0,
    defaultOutcome: POLICY_OUTCOMES.ALLOW,
    mutation: false,
    verificationRequired: false,
    idempotency: "SAFE_RETRY",
    hardFlags: [],
  }),
  "research.record_item": definition({
    key: "research.record_item",
    domain: "research",
    description: "Record a new research item. Always starts at status OPEN.",
    operationClass: "LOCAL_WRITE",
    defaultRisk: RISK_LEVELS.L1,
    defaultOutcome: POLICY_OUTCOMES.ALLOW,
    mutation: true,
    verificationRequired: true,
    idempotency: "SERVER_KEY",
    hardFlags: [],
  }),
  "research.update_status": definition({
    key: "research.update_status",
    domain: "research",
    description:
      "Transition an existing research item's status. Illegal transitions are refused by a code-owned transition table.",
    operationClass: "LOCAL_WRITE",
    defaultRisk: RISK_LEVELS.L1,
    defaultOutcome: POLICY_OUTCOMES.ALLOW,
    mutation: true,
    verificationRequired: true,
    idempotency: "SERVER_KEY",
    hardFlags: [],
  }),

  // --- Phase P: Sales/Inbox ---------------------------------------------------
  // Durable tracking of inbound messages and local-only reply drafting. No
  // live email provider, no send/reply/archive against a real account — see
  // docs/yusuf-os/gate-b/sales-inbox.md. gmail.send_reply/archive_thread/
  // apply_label are explicitly NOT built here.
  "inbox.list_messages": definition({
    key: "inbox.list_messages",
    domain: "inbox",
    description: "List inbox messages by uuid or status.",
    operationClass: "READ",
    defaultRisk: RISK_LEVELS.L0,
    defaultOutcome: POLICY_OUTCOMES.ALLOW,
    mutation: false,
    verificationRequired: false,
    idempotency: "SAFE_RETRY",
    hardFlags: [],
  }),
  "inbox.read_message": definition({
    key: "inbox.read_message",
    domain: "inbox",
    description: "Read one inbox message by uuid.",
    operationClass: "READ",
    defaultRisk: RISK_LEVELS.L0,
    defaultOutcome: POLICY_OUTCOMES.ALLOW,
    mutation: false,
    verificationRequired: false,
    idempotency: "SAFE_RETRY",
    hardFlags: [],
  }),
  "inbox.record_message": definition({
    key: "inbox.record_message",
    domain: "inbox",
    description:
      "Ingest a new inbox message locally. Always starts at status NEW. Not a live email fetch.",
    operationClass: "LOCAL_WRITE",
    defaultRisk: RISK_LEVELS.L1,
    defaultOutcome: POLICY_OUTCOMES.ALLOW,
    mutation: true,
    verificationRequired: true,
    idempotency: "SERVER_KEY",
    hardFlags: [],
  }),
  "inbox.classify_message": definition({
    key: "inbox.classify_message",
    domain: "inbox",
    description:
      "Assert a closed-enum classification (OPPORTUNITY/INTERVIEW/REJECTION/BOUNCE/OTHER) for a message and optionally link an existing Career opportunity uuid. Never creates a Career row.",
    operationClass: "LOCAL_WRITE",
    defaultRisk: RISK_LEVELS.L1,
    defaultOutcome: POLICY_OUTCOMES.ALLOW,
    mutation: true,
    verificationRequired: true,
    idempotency: "SERVER_KEY",
    hardFlags: [],
  }),
  "inbox.prepare_reply": definition({
    key: "inbox.prepare_reply",
    domain: "inbox",
    description:
      "Store a local-only draft reply body. Never sends, replies, or reaches any external provider.",
    operationClass: "LOCAL_WRITE",
    defaultRisk: RISK_LEVELS.L2,
    defaultOutcome: POLICY_OUTCOMES.ALLOW,
    mutation: true,
    verificationRequired: true,
    idempotency: "SERVER_KEY",
    hardFlags: [],
  }),
  "inbox.archive_local": definition({
    key: "inbox.archive_local",
    domain: "inbox",
    description:
      "Mark a message archived in local bookkeeping only. Never a real provider archive action (see gmail.archive_thread, not built this phase).",
    operationClass: "LOCAL_WRITE",
    defaultRisk: RISK_LEVELS.L1,
    defaultOutcome: POLICY_OUTCOMES.ALLOW,
    mutation: true,
    verificationRequired: true,
    idempotency: "SERVER_KEY",
    hardFlags: [],
  }),
  // The Career integration seam, enforced in code rather than by agent
  // instruction: the raw career.update_status capability takes any
  // opportunity uuid with no awareness of how it was discovered, so Inbox is
  // never granted it directly (see AGENT_DEFINITIONS.INBOX). This is the
  // only capability Inbox holds into Career's state machine, and it only
  // succeeds when the target opportunity is the one actually linked (via
  // inbox.classify_message) from a message classified INTERVIEW or
  // REJECTION — enforced independently by both the request builder and the
  // adapter's execute()-time recheck, not left to the model's own judgment.
  "inbox.advance_linked_career_status": definition({
    key: "inbox.advance_linked_career_status",
    domain: "inbox",
    description:
      "Advance the Career opportunity linked to a classified inbox message (classification must be INTERVIEW or REJECTION). Refuses any opportunity uuid not actually linked from that message.",
    operationClass: "LOCAL_WRITE",
    defaultRisk: RISK_LEVELS.L2,
    defaultOutcome: POLICY_OUTCOMES.ALLOW,
    mutation: true,
    verificationRequired: true,
    idempotency: "SERVER_KEY",
    hardFlags: [],
  }),
});

const HARD_FORBIDDEN = Object.freeze([
  // Gate E: an Agent may never author its own review verdict, mark a gated
  // Task complete, or act as another Agent. These are code-owned invariants
  // so that even a fully compromised prompt cannot request them legally.
  "review.self_certify",
  "task.force_complete",
  "agent.impersonate",
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
