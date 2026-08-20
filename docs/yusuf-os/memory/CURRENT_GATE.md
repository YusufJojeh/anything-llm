# Current Gate

## Phase O — Research — status: COMPLETE

**Objective:** give Yusuf OS a durable, honest record of research questions Yusuf is investigating —
named in `PRODUCT_CHARTER.md`'s future-roster list, never previously scoped. Mirrors Phase N
(Founder)'s pattern, with its own transition table shape (a simple linear pipeline plus one
reopening edge).
**Design note:** `docs/yusuf-os/gate-b/research.md`.
**Implemented:**
- **`yusuf_research_items`** (new table) — `question`, `category`, `status` (four-value DB-level
  `CHECK` constraint), `notes`, `digest`, principal attribution.
- **`research.read_items`** (READ, L0, ALLOW) — by uuid or status.
- **`research.record_item`** (LOCAL_WRITE, L1, ALLOW) — the model supplies `question`/`category`/
  optional `notes`; the server always mints the uuid and always starts the row at `OPEN` regardless
  of what status the model asks for (test-proven).
- **`research.update_status`** (LOCAL_WRITE, L1, ALLOW) — transitions an item, validated against a
  code-owned transition table (`research/transitions.js`) at the same two checkpoints as
  Career/Marketing/Founder (early request-builder rejection against a fresh read; independent
  re-validation in `ResearchAdapter.execute()` against a fresh read at execute time).
- **Transition table:** `OPEN -> INVESTIGATING -> ANSWERED`, with `ABANDONED` reachable as a
  terminal off-ramp from any non-terminal state, and `ANSWERED -> INVESTIGATING` as the one
  reopening edge. Unlike Marketing's routine revision edges or Founder's resume-from-pause edge,
  this reopening edge exists because a *concluded* answer can later prove wrong when new evidence
  surfaces — documented as a "Why the reopening edge" section in the design note, and independently
  unit-tested that this is the *only* backward edge in the table.
- **Research Department + Research Agent** — one member, `allowedCapabilities`:
  `research.read_items`, `research.record_item`, `research.update_status`, `knowledge.read`,
  `knowledge.write`. No project/git/browser/memory-write/monitoring/career/marketing/founder
  capability. `autonomyLevel: MANUAL`.
**The one invariant:** unchanged — both new mutation capabilities pass through
`YusufActionBoundary` -> Policy -> Execution Coordinator -> Verification -> Audit like any other
governed capability.
**Tests:** `researchLifecycle.test.js` (10 integration cases, including the ANSWERED->INVESTIGATING
reopening edge), `researchTransitions.test.js` (8 unit cases, including one confirming
ANSWERED->INVESTIGATING is the only backward/reopening edge), plus `organizationModel.test.js`,
`agentRuntimeSecurity.test.js`, and two Command Center suites updated. **68 suites / 859 tests**
(was 66/825). See `TEST_BASELINE.md`.
**Independent review found no P0/P1/P2** — confirmed no model-supplied-status bypass, no TOCTOU gap
in the transition recheck (including specific scrutiny on the reopening edge), consistent digest
recomputation across create/update/verify, structural capability isolation, and exact
migration/schema/constants alignment.
**Remaining:** no automated web research/search integration (needs Browser Broker + a real search
integration, a separate later decision); no retention on `yusuf_research_items`; no Command Center
UI surfacing.
**Next automatic phase:** per the CAVEMAN MODE implementation order — Sales/Inbox, Integrations,
Model routing/cost, Command Center expansion, hardening, release/ops — the specific next phase to
be determined by reading `DEFERRED_WORK.md`.

## Phase N — Founder — status: COMPLETE

**Objective:** give Yusuf OS a durable, honest record of side-project ventures Yusuf is running —
named in `PRODUCT_CHARTER.md`'s future-roster list, never previously scoped. Mirrors Phase L/M's
pattern, with its own transition table shape (branching + one resume edge).
**Design note:** `docs/yusuf-os/gate-b/founder.md`.
**Implemented:**
- **`yusuf_founder_ventures`** (new table) — `name`, `category`, `status` (six-value DB-level
  `CHECK` constraint), `notes`, `digest`, principal attribution.
- **`founder.read_ventures`** (READ, L0, ALLOW) — by uuid or status.
- **`founder.record_venture`** (LOCAL_WRITE, L1, ALLOW) — the model supplies `name`/`category`/
  optional `notes`; the server always mints the uuid and always starts the row at `IDEA`
  regardless of what status the model asks for (test-proven).
- **`founder.update_status`** (LOCAL_WRITE, L1, ALLOW) — transitions a venture, validated against
  a code-owned transition table (`founder/transitions.js`) at the same two checkpoints as
  Career/Marketing (early request-builder rejection against a fresh read; independent
  re-validation in `FounderAdapter.execute()` against a fresh read at execute time).
- **Transition table:** `IDEA -> VALIDATING -> BUILDING -> LAUNCHED`, with `VALIDATING`/
  `BUILDING`/`LAUNCHED` each able to branch to `PAUSED` or `KILLED`, and `PAUSED` able to resume
  to `BUILDING` (the one backward/resume edge) or be `KILLED`. `LAUNCHED` has no backward edge —
  reaching it always requires having passed through `BUILDING`, and resuming from `PAUSED` always
  lands at `BUILDING` specifically, never directly back at `LAUNCHED`. `KILLED` is terminal.
- **Founder Department + Founder Agent** — one member, `allowedCapabilities`:
  `founder.read_ventures`, `founder.record_venture`, `founder.update_status`, `knowledge.read`,
  `knowledge.write`. No project/git/browser/memory-write/monitoring/career/marketing capability.
  `autonomyLevel: MANUAL`.
**The one invariant:** unchanged — both new mutation capabilities pass through
`YusufActionBoundary` -> Policy -> Execution Coordinator -> Verification -> Audit like any other
governed capability.
**Tests:** `founderLifecycle.test.js` (10 integration cases, including the PAUSED->BUILDING resume
edge), `founderTransitions.test.js` (9 unit cases, including one confirming PAUSED->BUILDING is
the only edge that resumes toward the main pipeline), plus `organizationModel.test.js`,
`agentRuntimeSecurity.test.js`, and two Command Center suites updated. **66 suites / 825 tests**
(was 64/792). See `TEST_BASELINE.md`.
**Independent review found no P0/P1/P2** — confirmed no model-supplied-status bypass, the
branching transition graph (unlike Career's purely-forward table or Marketing's two-backward-edge
table) introduces no TOCTOU gap or path that reaches `LAUNCHED` without passing through
`BUILDING` or revives a `KILLED` venture, consistent digest recomputation across
create/update/verify, structural capability isolation, and exact migration/schema/constants
alignment.
**Remaining:** no financial/investment tracking (a future Finance phase's decision); no legal/
incorporation automation; no retention on `yusuf_founder_ventures`; no Command Center UI
surfacing.
**Next automatic phase:** Phase O (Research) — **COMPLETE, see above.**

## Phase M — Marketing — status: COMPLETE

**Objective:** give Yusuf OS a durable, honest record of marketing content Yusuf is producing —
named in `PRODUCT_CHARTER.md`'s future-roster list, never previously scoped. Mirrors Phase L
(Career)'s pattern almost exactly, with a deliberately different transition table.
**Design note:** `docs/yusuf-os/gate-b/marketing.md`.
**Implemented:**
- **`yusuf_marketing_content`** (new table) — `title`, `channel`, `format`, `status` (six-value
  DB-level `CHECK` constraint), `notes`, `digest`, principal attribution.
- **`marketing.read_content`** (READ, L0, ALLOW) — by uuid or status.
- **`marketing.record_content`** (LOCAL_WRITE, L1, ALLOW) — the model supplies `title`/`channel`/
  `format`/optional `notes`; the server always mints the uuid and always starts the row at `IDEA`
  regardless of what status the model asks for (test-proven).
- **`marketing.update_status`** (LOCAL_WRITE, L1, ALLOW) — transitions a content item, validated
  against a code-owned transition table (`marketing/transitions.js`) at the same two checkpoints
  as Career (early request-builder rejection against a fresh read; independent re-validation in
  `MarketingAdapter.execute()` against a fresh read at execute time).
- **Unlike Career, Marketing's transition table has two deliberate backward edges**:
  `READY_FOR_REVIEW -> DRAFTING` (sent back for revision) and `SCHEDULED -> DRAFTING` (pulled back
  before it went out) — a content review/scheduling pipeline realistically needs revision loops,
  unlike a career opportunity pipeline. `PUBLISHED` has no backward edge at all: un-publishing is
  not a "back to drafting" event. Documented as a "Why one backward edge" section in the design
  note, and independently unit-tested that these two are the *only* backward edges in the table.
- **Marketing Department + Marketing Agent** — one member, `allowedCapabilities`:
  `marketing.read_content`, `marketing.record_content`, `marketing.update_status`,
  `knowledge.read`, `knowledge.write`. No project/git/browser/memory-write/monitoring/career
  capability. `autonomyLevel: MANUAL`.
**The one invariant:** unchanged — both new mutation capabilities pass through
`YusufActionBoundary` -> Policy -> Execution Coordinator -> Verification -> Audit like any other
governed capability.
**Tests:** `marketingLifecycle.test.js` (11 integration cases, including both backward-edge
transitions), `marketingTransitions.test.js` (9 unit cases, including one that independently
recomputes and asserts the exact set of backward edges), plus `organizationModel.test.js`,
`agentRuntimeSecurity.test.js`, and two Command Center suites updated. **64 suites / 792 tests**
(was 62/760). See `TEST_BASELINE.md`.
**Independent review found no P0/P1/P2** — confirmed no model-supplied-status bypass, the
added backward-edge transition surface introduces no TOCTOU gap or laundering path (every hop is
independently re-validated against the current row at execute time), consistent digest
recomputation across create/update/verify, structural capability isolation via the code-owned
registry, and exact migration/schema/constants alignment (CHECK constraint values match
`MARKETING_CONTENT_STATUSES` exactly).
**Remaining:** no real publishing/posting integration — `PUBLISHED` is an unverified self-report,
documented explicitly in the design note's Known limitations; no retention on
`yusuf_marketing_content`; no Command Center UI surfacing.
**Next automatic phase:** Phase N (Founder) — **COMPLETE, see above.**

## Phase L — Career — status: COMPLETE

**Objective:** give Yusuf OS a durable, honest record of career opportunities Yusuf is pursuing —
named in `PRODUCT_CHARTER.md`'s future-roster list, never previously scoped.
**Design note:** `docs/yusuf-os/gate-b/career.md`, written before code.
**Implemented:**
- **`yusuf_career_opportunities`** (new table) — `company`, `role`, `source`, `status` (six-value
  DB-level `CHECK` constraint), `notes`, `digest`, principal attribution.
- **`career.read_opportunities`** (READ, L0, ALLOW) — by uuid or status.
- **`career.record_opportunity`** (LOCAL_WRITE, L1, ALLOW) — the model supplies `company`/`role`/
  optional `source`/`notes`; the server always mints the uuid and always starts the row at
  `RESEARCHING` regardless of what status the model asks for (test-proven).
- **`career.update_status`** (LOCAL_WRITE, L1, ALLOW) — transitions an opportunity, validated
  against a code-owned transition table (`career/transitions.js`) at two checkpoints: an early
  rejection in the request builder against a fresh read, and a re-validation in
  `CareerAdapter.execute()` against an independent fresh read at execute time (closing the window
  the framework's generic live-preflight recheck narrows) — the same defense-in-depth placement as
  Memory's scope-ownership check.
- **Career Department + Career Agent** — one member, `allowedCapabilities`:
  `career.read_opportunities`, `career.record_opportunity`, `career.update_status`,
  `knowledge.read`, `knowledge.write`. No project/git/browser/memory-write/monitoring capability.
  `autonomyLevel: MANUAL` — task-driven, not `AUTONOMOUS` (nothing about tracking a job search
  calls for an Agent that starts work on its own, unlike Monitoring).
**The one invariant:** unchanged — both new mutation capabilities pass through
`YusufActionBoundary` -> Policy -> Execution Coordinator -> Verification -> Audit like any other
governed capability.
**Tests:** `careerLifecycle.test.js` (8 integration cases), `careerTransitions.test.js` (7 unit
cases), plus `organizationModel.test.js`, `agentRuntimeSecurity.test.js`, and two Command Center
suites updated. **62 suites / 760 tests** (was 60/734). See `TEST_BASELINE.md`.
**Independent review found no P0/P1** — the first phase in this run where independent review found
nothing blocking on its first pass. Confirmed no model-supplied-status bypass, no TOCTOU gap in
the transition recheck, consistent digest recomputation across create/update/verify, structural
capability isolation via the code-owned registry (not the database), and exact migration/schema/
constants alignment. One P2 documentation nit (notes cannot be cleared via `update_status`, only
replaced — intentional) was folded in as a one-line code comment rather than filed separately. See
`GATE_HISTORY.md`.
**Remaining:** no job-board/email integration (needs Browser Broker + a real per-service form
registration, a separate later decision); no resume/cover-letter generation; no retention on
`yusuf_career_opportunities`; no Command Center UI surfacing.
**Next automatic phase:** Phase M (Marketing) — **COMPLETE, see above.**

## Phase K — Monitoring — status: COMPLETE

**Objective:** give Yusuf OS a real Agent that watches Yusuf OS's own internal health signals and
durably records what it found — the first use of `AUTONOMY_LEVELS.AUTONOMOUS`, which the
Organization model deliberately defined but left unused.
**Design note:** `docs/yusuf-os/gate-b/monitoring.md`, written before code, amended once after
independent review to document a caught-and-fixed self-observation bug.
**Implemented:**
- **`yusuf_monitoring_checks`** (new table, append-only check history) — `checkKey`, `status`
  (`OK`/`WARN`/`BREACH`, DB-level CHECK constraint), `observedValue`/`threshold` (JSON snapshots),
  `summary`, `digest`, principal attribution.
- **`system.read_health`** (READ, L0, ALLOW) — returns the raw four-signal snapshot (pending
  approvals, unresolved intents, control-plane health, kill-switch state) with no interpretation.
- **`monitoring.record_check`** (LOCAL_WRITE, L1, ALLOW) — the model supplies only a `checkKey`;
  the adapter recomputes the snapshot itself at execute time and derives `status`/`summary` from
  code-owned thresholds (`monitoring/thresholds.js`) — mirrors `recordEvidence`'s `VALIDATION`-kind
  pattern from Gate E. A model cannot force a false verdict by lying in its call arguments
  (test-proven).
- **Monitoring Department + Monitoring Agent** — one member, `allowedCapabilities`:
  `system.read_health`, `monitoring.record_check`, `knowledge.read`, `knowledge.write`. No
  project/git/browser/memory-write capability. `autonomyLevel: AUTONOMOUS` — first real use.
- **New structural invariant**: no `AUTONOMOUS`-level Agent may ever hold a capability whose
  `defaultRisk` is above `L1` or whose `operationClass` is `EXTERNAL_MUTATION`, enforced by a
  registry-driven `test.each`-style loop over every `AgentDefinition`, guarding against
  "autonomous" ever quietly becoming a second, softer path around approval (the same class of bug
  as the previously-fixed scheduled-job auto-approve vulnerability, `GATE_HISTORY.md`).
**The one invariant:** unchanged — both new capabilities pass through `YusufActionBoundary` ->
Policy -> Execution Coordinator -> Verification -> Audit like any other governed capability;
`AUTONOMOUS` is an orchestration label only, never consulted by Policy (extends the Organization
model's own invariant, now covering a second concept).
**Tests:** `monitoringLifecycle.test.js` (8 integration cases), `monitoringThresholds.test.js` (11
unit cases), plus `organizationModel.test.js`, `agentRuntimeSecurity.test.js`, and two Command
Center suites updated. **60 suites / 734 tests** (was 58/705). See `TEST_BASELINE.md`.
**Independent review caught one real P1 bug**: the health snapshot's fix for a self-observation
paradox (a check's own intent is still `EXECUTING` while it reads the snapshot) originally excluded
the *whole* `monitoring.record_check` capability from the unresolved-intents count — but that
capability performs a real write that can legitimately get stuck `EXECUTING`/`FAILED_UNKNOWN`,
which is exactly the class of unproven effect this signal exists to catch; a capability-wide
exclusion would hide it forever, not just the in-flight call. Fixed to exclude only the exact
in-flight intent id (`excludeIntentId`, threaded from `prepared.intent.id`); `system.read_health`
(which persists nothing) is still safely excluded as a whole class. A regression test manufactures
a stuck *prior* `monitoring.record_check` intent and asserts a later check still reports it. See
`GATE_HISTORY.md` and the design note's "A self-observation hazard" section. Everything else
reviewed checked out clean (verdict-derivation cannot be spoofed by the model; the AUTONOMOUS
risk-ceiling test is registry-driven, not hardcoded; Monitoring has no path, direct or chained, to
any external mutation; `reconcile()`'s narrower existence-only check is accurately documented, not
an understated gap; migration is additive-only with a correct CHECK constraint).
**Remaining:** no scheduled trigger for Monitoring runs; only one registered `checkKey`; no
retention on `yusuf_monitoring_checks`; no Command Center UI surfacing.
**Next automatic phase:** Phase L (Career) — **COMPLETE, see above.**

## Phase J — Knowledge/Evidence/Memory split — status: COMPLETE

**Objective:** implement ADR-008 (accepted at Gate B, never built until now) — separate
conversational Memory, sourced Knowledge, and execution Evidence, which had been living only as a
single undifferentiated `yusuf_run_evidence` table.
**Design note:** `docs/yusuf-os/gate-b/knowledge-evidence-memory.md`, written before code, corrected
twice after implementation and after independent review.
**Implemented:**
- **Evidence classification + retention** (additive to `yusuf_run_evidence`): `evidenceClass` (one
  of `PUBLIC_METADATA`/`SANITIZED_OUTPUT`/`SENSITIVE_OPERATIONAL`/`SCREENSHOT`/`SECRET_FORBIDDEN`),
  `expiresAt` derived from a code-owned retention table, `tombstonedAt`. `SECRET_FORBIDDEN` exists
  only to be refused at write time — `AgentRunCoordinator.recordEvidence` throws `ACTION_FORBIDDEN`
  rather than ever persisting it. `EvidenceRetention.tombstoneExpiredEvidence` truncates expired
  rows' `summary`/`payload` while preserving `digest`/`evidenceClass`/`kind`; not agent-invokable,
  not a capability — plain system-owned truncation, same trust tier Gate E already gave Evidence.
- **Knowledge** (`yusuf_knowledge_entries`, new table) — sourced facts (`AGENT_DERIVED`/
  `USER_PROVIDED`/`DOCUMENT_CITED`) an Agent asserts. `knowledge.read`/`knowledge.write`, both L0/L1
  ALLOW, no approval. Every write is a true create with a server-minted uuid — two calls with
  identical content produce two distinct rows, proven by test, because Knowledge is meant to
  accumulate observations, not overwrite them.
- **Memory** (`yusuf_memory_entries`, new table) — scoped key/value facts
  (`PERSONAL`/`PROJECT`/`AGENT`/`TASK`/`CONVERSATION`), `@@unique([scope, scopeRef, key])` so a
  write is a true upsert. `memory.read`/`memory.write`, both L0/L1 ALLOW.
- **First-ever governed adapter whose "external effect" is a Prisma write, not something outside
  the schema** (unlike LocalGit/Project/Browser). Decided (and documented) that this still goes
  through the full Intent -> Policy -> Execution -> Verification -> Audit boundary rather than
  Evidence's ungoverned pattern, because Knowledge/Memory are new facts an Agent chooses to assert
  from its own reasoning — the same trust boundary as `project.write_file`, not system narration
  about an already-governed run.
- **Memory scope-ownership enforcement** (`adapters/memory/scopeIdentity.js`,
  `assertScopeOwnership`): checked server-side against `intent.agentId`/`taskId`/
  `requestedByPrincipalType` — never a client-supplied string — at both `preflight()` and
  `prepare()` (defense in depth, mirroring `assertRepositoryMatchesTask`'s placement). `PERSONAL`
  scope is hard-refused for any non-`USER` principal regardless of grant; `AGENT`/`TASK`/
  `CONVERSATION`/`PROJECT` scope each require the `scopeRef` to actually match the acting identity.
- **Agent grants** (the first *granted*, not just *reachable*, capabilities for this pattern):
  Engineering gets `knowledge.read`, `knowledge.write`, `memory.read`, `memory.write`; Reviewer gets
  `knowledge.read` only; Chief of Staff untouched (`[]`) — considered and rejected, see design note.
**The one invariant:** unchanged — every Knowledge/Memory write still passes through
`YusufActionBoundary` -> Policy -> Execution Coordinator -> Verification -> Audit like any other
governed capability; nothing about this phase's new "effect is our own database" adapter class was
allowed to become a shortcut around that chain.
**Tests:** `knowledgeMemoryLifecycle.test.js` (24 integration/lifecycle cases),
`knowledgeMemoryValidation.test.js` (15 unit cases), plus `agentRuntimeSecurity.test.js` and
`migrationSafety.test.js` updates. **58 suites / 705 tests** (was 56/666). See `TEST_BASELINE.md`.
**Independent review caught one real P1 bug**: `tombstoneExpiredEvidence` originally truncated a
row and appended its audit event as two separate, un-transacted calls — a failure in the audit step
after truncation would destroy evidence content with zero audit trail, and the row's `tombstonedAt`
gate would permanently exclude it from ever being retried. Fixed by wrapping both operations in one
`db.$transaction` using the existing `AuditService.appendInTransaction` pattern (already used by
`IntentService.create`). Verified by a dedicated test that forces the transaction to fail and
asserts the row is left completely untouched, not half-truncated. Three P2 findings were reviewed
and explicitly accepted rather than fixed (Knowledge/Memory have no retention mechanism yet; the
migration's CHECK constraints aren't mirrored in `schema.prisma`'s plain-`String` columns — verified
this is pre-existing convention, not a new bug, via `yusuf_handoffs.status`; a `preflight()` throw
still doesn't transition the intent to a terminal state — a pre-existing framework gap, not
introduced by this phase). See `GATE_HISTORY.md` and the design note's "Known limitations" section.
**Remaining:** no Command Center UI surfacing this phase (same pattern as Gate F/organization
model); no scheduled trigger wired to call `tombstoneExpiredEvidence`; no Memory Curator role yet.
**Next automatic phase:** Phase K (Monitoring) — **COMPLETE, see above.**

## Organization model (Department/AutonomyLevel) — status: COMPLETE

**Objective:** give future specialist roles (Research, Monitoring, Marketing, Career, Founder,
Memory Curator) a place to attach to without producing "137 fake agents."
**Design note:** `docs/yusuf-os/gate-b/organization-model.md` (written before the code — no prior
gate-b doc covered this).
**Implemented:** `server/domain/yusufOS/organization/departments.js` — a code-owned Department
registry (not a DB table) grouping the existing three AgentDefinitions into two real Departments:
`system_core` (Chief of Staff) and `engineering` (Engineering + Reviewer). Each AgentDefinition
also gained an `autonomyLevel` (`MANUAL`/`SUPERVISED`/`AUTONOMOUS`) — an orchestration-only label;
no Agent is `AUTONOMOUS` yet. **Zero new Agents, zero new DB tables, zero new Job/Workflow
primitive** — those already exist as `yusuf_tasks`/`yusuf_agent_runs`/`yusuf_handoffs`.
**The one invariant:** Department and AutonomyLevel are never consulted by
PolicyEngine/ApprovalService/the capability registry to decide approval requirements — enforced by
a regression test that greps the security kernel files for either concept and fails if found.
**Tests:** `organizationModel.test.js`, 14 cases. Independent review: no P0/P1.
**Remaining:** no UI change this phase (same pattern as Gate F — backend model first). A third
Department appears only when a phase builds a real Agent that belongs in it.
**Next automatic phase:** Phase J (Knowledge/Evidence/Memory split) — **COMPLETE, see above.**

## Phase I — governed browser mutations — status: COMPLETE

**Objective:** semantic browser mutation capabilities behind Durable Approval.
**Implemented:** `browser.submit_form` — the first governed browser mutation. Registry-mediated
(`formRegistry.js`, empty in production): an Agent supplies only `formKey` + allowlisted field
values, never a selector or URL. L3 external mutation through the standard Intent -> Policy ->
Approval -> ExecutionCoordinator -> Verification -> Audit chain. Wrong-account refusal and
page-content-drift refusal (`mutationGuards.js`: `assertAccountMatches`, `assertPageUnchanged`)
both re-checked adapter-side immediately before the click, on top of the framework's generic
live-preflight recheck. `FAILED_UNKNOWN -> reconcile` on any uncertain driver outcome — no blind
retry. `#verifySubmission`/`reconcile` independently re-read the page rather than trusting the
driver's own report. No Agent role grants `browser.*` yet (reachable, not yet authorized).
**Independent review caught two real bugs before commit** (self-review had missed both, per the
standing lesson below): field selectors were being dropped before reaching the CDP driver (would
type into the wrong element or nothing on a real page — the fixture driver's leniency hid it), and
`assertPageUnchanged` was written and unit-tested but never actually wired into the execute-time
recheck. Both fixed; the fixture driver now itself enforces the corrected field shape so a
regression here fails a test again, not just a code review.
**Tests:** `browserSubmitFormLifecycle.test.js` (13 lifecycle/security scenarios),
`browserMutationGuards.test.js` (28 pure-function cases), `browserBrokerSecurity.test.js` updated.
**Remaining:** the CDP path (`CdpBrowserDriver.submitForm`) has not been run against a real
browser — same caveat as Phase H's read path. Granting `browser.submit_form` to an actual Agent
role, and registering a real production form in `formRegistry.js`, are separate future decisions
(`DEFERRED_WORK.md`).
**Next automatic phase:** Organization model (Department/Agent/Capability/Job/Workflow), then J
(Knowledge/Evidence/Memory split).

## Phase H — Browser Broker (read-only) — status: COMPLETE

**Objective:** safely observe authenticated sites through Yusuf's own browser session.

**Implemented:** ADR-011 attachment decision (CDP attach to an operator-launched Chrome behind
three opt-ins); exact-host origin allowlist; page sanitizer that separates hidden text, counts
injection markers, redacts secrets and stamps `UNTRUSTED_WEB_CONTENT`; CDP + fixture drivers; six
typed read-only capabilities; wired into tool binding and System Health.

**Remaining:** none for read-only. The CDP path has not been run against a real browser.

**Human-only blockers:** browser opt-in + origin allowlist choice (`HUMAN_ACTION_REQUIRED.md` §2);
the still-open `/os` manual validation (§1).

**Next automatic phase:** Phase I, then J (Knowledge/Evidence/Memory).

---


_Last updated: 2026-08-18 (Gate G implementation pass). Gates B-G complete; Gate H not started._

## Gate E — First Governed AI Staff Runtime — status: COMPLETE

See `GATE_HISTORY.md` for the full record. Implemented and tested:

- **Three code-owned AgentDefinitions** (`server/domain/yusufOS/agents/definitions.js`):
  `chief_of_staff` (orchestrates, **zero** capabilities), `engineering` (project + git
  read/write incl. L3 push), `reviewer` (read-only). The role's allowlist is code-owned, so a DB
  grant can narrow a role but never widen it — `AgentRegistry.assertGrantAllowed` refuses.
- **Durable handoffs** (`yusuf_handoffs`) with a code-owned set of legal delegation edges,
  acting-agent verification (an Agent may only create a handoff *from itself*), and server-derived
  idempotency keys.
- **Independent review** (`yusuf_review_verdicts`): a verdict may only attach to a run whose
  `runKind` is `REVIEW` *and* whose owning agent is the `reviewer` role. `reviewRunId` is unique,
  so verdicts are immutable; history is append-only, so a later PASS never erases an earlier BLOCK.
- **Deterministic completion gate** (`orchestration/CompletionPolicy.js`): reads only persisted
  state (evidence rows, review verdicts, approval/intent status). Blockers:
  `NO_IMPLEMENTATION_EVIDENCE`, `NO_VALIDATION_EVIDENCE`, `VALIDATION_FAILED`, `NO_REVIEW`,
  `REVIEW_BLOCKED`, `REVIEW_STALE`, `APPROVAL_PENDING`, `SECURITY_BLOCKER`,
  `EXTERNAL_EFFECT_UNVERIFIED`.
- **Structured output contracts** (`agents/contracts.js`): model output is validated and any
  authority-bearing field (risk, policy, approval, verification, task status, review verdict,
  agent identity) is rejected at any nesting depth before it can reach a state transition.
- **Two new governed capabilities**: `project.write_file` (reuses Gate D's hardened path policy —
  project-root scoped, traversal/symlink/protected-path safe, atomic rename, before/after digest)
  and `project.run_command` (semantic key → server-owned executable+argv from
  `yusuf_project_commands`; executables restricted to a code-owned allowlist; `shell: false`;
  minimal env allowlist). **No raw shell, no arbitrary filesystem.**
- **Run lifecycle**: new `WAITING_TOOL` / `WAITING_HANDOFF` states, `RUN_FAILURE_KINDS` so
  failures stay distinguishable, server-derived run idempotency, durable concurrency limits.
- Migration `20260817180000_add_yusuf_os_agent_runtime` (additive; hand-corrected to preserve
  Gate C's CHECK constraints that Prisma's table-redefine drops).

## Gate F — Command Center Backend Projections — status: COMPLETE

Read-only projections implementing `docs/yusuf-os/gate-b/api-realtime-frontend.md` §4-5. **No UI
was built.** See `GATE_HISTORY.md` for the full record including the six independent-review
findings that were fixed. Surface:

- `GET /api/yusuf-os/dashboard` — the normalized §4 projection.
- `GET /api/yusuf-os/events?after=` — cursor-paged `YusufEventEnvelope`s.
- `GET /api/yusuf-os/events/stream` — SSE with `Last-Event-ID` resume and reset frames.
- `POST /api/yusuf-os/audit-integrity/check` — the only path that walks the chain.

All behind the existing localhost + bearer-token control-plane guard.

## Gate G — AI Staff Command Center frontend — status: COMPLETE

The first frontend gate. `/os` is a relationship-centric AI Staff Command Center built strictly
against the Gate F projections; `/` is untouched. See `GATE_HISTORY.md` for the full record.

- **Feature module** `frontend/src/features/yusufOS/` (api / realtime / state / components /
  i18n / styles) plus routes under `frontend/src/pages/YusufOS/`. No new state library, no graph
  library — the constellation is arithmetic on a unit circle rendered as plain SVG.
- **Routes:** `/os`, `/os/agents`, `/os/tasks`, `/os/tasks/:taskId`, `/os/approvals`,
  `/os/approvals/:approvalId`, `/os/runs`, `/os/runs/:runId`, `/os/projects`, `/os/system`.
- **Browser auth bootstrap** (`server/domain/yusufOS/api/uiSession.js`): the control token is
  exchanged once, over loopback, for an httpOnly + SameSite=Strict server-side session with a
  double-submit CSRF token. Same secret, same comparison, same loopback rule as the bearer
  guard; `/api/yusuf-os/*` is completely unchanged.
- **Additive uuid-addressed drilldown projections** (`projections/DetailProjections.js`) closing
  a real Gate F contract gap — see `KNOWN_RISKS.md`.
- **Snapshot-first + SSE reconciliation**: HTTP `/dashboard` is authoritative; the stream only
  decides *when to refetch*. Duplicates, out-of-order, gaps, resets, unknown schema versions,
  reconnects and visibility restores all resolve to "reload the snapshot".
- **No fake data**: real zero, unknown, LOADING, EMPTY and ERROR are five distinct states, and
  UNCHECKED/STALE audit verdicts never render as healthy.

## Gate G.1 — Visual fidelity & premium polish — status: COMPLETE

Visual-only refinement of the existing `/os` surfaces; no architecture or capability change and no
backend diff. Central core +26% dominance, roster-adaptive constellation spacing, code-owned Agent
role glyphs, status halos and a projection-backed activity arc, relationship semantics derived from
the persisted handoff reason, a rail cut from 152px to 57px, and a depth/typography/motion token
pass. See `GATE_HISTORY.md`.

**Gate G itself is still blocked on live real-control-plane validation** — see `KNOWN_RISKS.md`.

## Next gate: Gate H — not defined [not started]

**Blockers before starting:** none technical; **waiting on Yusuf's explicit instruction.**
Candidate deferred work is listed in `DEFERRED_WORK.md` (real LLM provider wiring, the remaining
`/os` modules, RFC 9457 error migration).
