# Current Gate

## Phase Z — Command Center Operational UI — status: COMPLETE

The `/os` Command Center now renders durable scheduler/notification operational state from the
existing dashboard projection: attention includes durable incidents, acknowledgement is a
separate non-approval action, and System Health shows persisted schedules, their next run, and
their recorded failure state. Status mapping explicitly distinguishes enabled scheduler state from
Agent activity or approval semantics. Existing responsive, RTL, accessible shell/routes remain
unchanged and real-data-only.

Independent review: **P0=0/P1=0/P2=1**, PASS. Yusuf OS frontend regression: **10 files, 140
passed**; final focused review checks: **55 passed**; targeted lint, production build, and diff
checks passed. Code commits: `701c2eb6`, `e3712719`, `05b1ec12`.

P2 follow-up: present each durable notification kind with a localized human label rather than its
stored enum. `.claude/` remains untracked. No push, deployment, or live external mutation
occurred.

**Next:** Phase AA — fresh security hardening review.

## Phase Y — Scheduler + Notifications — status: COMPLETE

Added a durable local scheduler with a single code-owned evidence-retention job, exclusive
leases, coalesced missed runs, persisted jitter/backoff, failure evidence, and a boot worker.
No scheduler path can auto-approve or execute an L3/L4 action. Operator attention is durable,
audited, acknowledgement-aware, and derived from persisted approvals, tasks, intents, monitoring,
model, inbox, and governed-adapter facts. Incidents resolve when their source clears and only
reopen with fresh audit evidence on a later recurrence.

Independent review: **P0=0/P1=0/P2=2**, PASS. Focused scheduler, Command Center, and migration
checks: **3 suites, 39 passed**; lint and diff checks passed. Code commits: `9e1e82e3`,
`7eac029e`, `8a0e3345`.

P2 follow-ups: renew a long-running retention lease; surface worker boot/tick failures instead of
relying on the next process restart. `.claude/` remains untracked. No push, deployment, or live
external mutation occurred.

**Next:** Phase Z — advance the next bounded V1 critical-path slice.

## Phase X — Real Browser Integration Readiness — status: COMPLETE

Prepared the Browser Broker for a human-controlled live validation while preserving its default
disabled/empty-registry posture. CDP discovery and final websocket attachment are numeric-loopback
only, credential-free, bounded, and redirect-free; cookie-only identity cannot authorize a
mutation; the full external-content attack corpus stays in untrusted prompt data.

Independent review: **P0=0/P1=0/P2=0**, PASS. Focused regression **5/5 suites, 101 passed**;
server lint and `git diff --check` passed. Code commit: `90e52eda`.

**Next:** Phase Y — Scheduler + Notifications.

## Phase W — Agentic Career E2E Fixture — status: COMPLETE

The real AgentReasoningLoop now proves Chief → Research/cited evidence → Career preparation → L3
approval → fixture Browser verification → proof-bound APPLIED → hostile Inbox reply → linked
INTERVIEWING, with task-scoped Command Center visibility. Internal opportunity correlation is
approval-covered but never submitted to the external form.

Independent review: **P0=0/P1=0/P2=2**, PASS. Yusuf OS regression: **55/55 suites, 730 passed,
one optional Ollama smoke skipped**; final focused regression **3/3 suites, 26 passed**; lint and
diff checks passed. Code/test commits: `270c2a6e`, `3876a449`.

**Next:** Phase X — Real Browser Integration Readiness.

## Phase V — Agentic Engineering E2E — status: COMPLETE

Implemented the deterministic disposable-repository proof that a structured model drives the real
Chief → Engineering → Reviewer chain: the model selects the bounded branch/read/write/test/stage/
local-commit capabilities through `AgentReasoningLoop`; server-owned evidence is projected from
verified governed receipts; the independent Reviewer receives bounded untrusted receipt, policy,
and evidence context, reads the committed change, and returns the authoritative routed verdict.
Completion remains server-owned and reads persisted evidence, receipts, and review state.

Independent review: **P0=0/P1=0/P2=1**. The remaining P2 is a dedicated resume/re-entry evidence
projection idempotence test; the full fixture already asserts exactly two projected records after
repeated loop checkpoints.

Evidence (`VERIFIED_BY_TEST`, 2026-08-22): Yusuf OS baseline excluding the unfinished Phase W
fixture **54/54 suites, 729 passed, one optional Ollama smoke skipped**; focused Phase V E2E
**2/2 passed**; server lint and `git diff --check` passed. Code commits: `614f6f48`, `d63e451c`.

**Next:** Phase W — Agentic Career E2E Fixture.

## Phase U — Voice / Audio Plane — status: COMPLETE

Implemented a privacy-governed push-to-talk interface in `/os`, bounded STT/TTS provider
selection with local-first fallback, request cancellation, and a voice-command bridge into the
real Chief-of-Staff reasoning loop. Voice is input/output only: L3 commands still create the
same durable, digest-bound approval and cannot execute without it.

Independent review: **P0=0/P1=0/P2=2**. Remaining P2s are server-provider voice selection in the
UI and expansion of the explicit audio edge-case fixture matrix.

Evidence (`VERIFIED_BY_TEST`, 2026-08-21): full server **84/84 suites, 1,030 passed, one optional
live Ollama smoke skipped**; frontend **10/10 suites, 139 passed**; server/frontend lint,
production build, focused voice suites, and `git diff --check` passed. Code commit: `cc51b443`.

**Next:** Phase V — Agentic Engineering E2E.

## Phase T — Real Agentic Reasoning Loop — status: COMPLETE

Implemented the production Task→Agent→PromptAssembler→RoutedModelClient→strict decision→
`toolBinding.invokeCapability`→safe result→reason-again loop. Decisions are closed JSON contracts;
prompts separate trusted policy, assigned objective, and delimited untrusted data; provider
responses are streamed under byte/time limits; model/capability/context matching fails honestly;
all safety budgets, fingerprints, and leases are durable. Reviewer verdicts require an independently
routed Reviewer completion and atomically finalize verdict, run, and handoff.

Independent review: **P0=0/P1=0/P2=3**. Remaining P2s: multi-transaction handoff crash
reconciliation, preferred-provider fallback observability, and OpenAI body-inclusive latency.

Evidence (`VERIFIED_BY_TEST`, 2026-08-21): full Yusuf OS backend **51/51 suites, 712 passed,
one optional live Ollama smoke skipped**; focused reviewer run 228 passed/one optional skip;
targeted ESLint, Prisma validate, migration safety, and `git diff --check` passed. Code commit:
`fe7ebac8`.

**Next:** Phase U — Voice / Audio Plane.

## Phase S — Runtime Command Center — status: COMPLETE

**Objective:** finish the interrupted Phase S work without rebuilding the existing `/os` Command
Center. Added a guarded read-only `/api/yusuf-os/runtime` projection and a real `/os/runtime`
surface for model/provider state, routed completion telemetry, organization/job counts,
Monitoring history, and safe Knowledge/Evidence/Memory counts.

**Security and truth guarantees:** OpenAI is presence-only; Ollama endpoint output is origin-only;
model/error strings are bounded, redacted, and bidi-safe; only code-marked routed completions are
shown; unavailable cost never becomes zero; Knowledge/Memory free text and scope references never
enter the projection; Runtime failure cannot blank the existing Command Center; state polls every
30 seconds and renders its observation timestamp.

**Independent review:** initial P0=0/P1=5/P2=2. All findings fixed and re-reviewed to
**P0=0/P1=0/P2=0**.

**Evidence (`VERIFIED_BY_TEST`, 2026-08-21):** full server regression 77 suites / 969 tests
(968 passed, one live-provider smoke skipped); Yusuf OS frontend 9 suites / 133 tests; frontend
production build passed; targeted server/frontend lint and `git diff --check` passed. Ollama and
OpenAI remain `NOT LIVE-VALIDATED` because neither provider was available. Local code commit:
`47da3247`.

**Next:** Phase T — real Agentic Reasoning Loop — not yet implemented.

## Phase R — Model runtime (ModelRouter) — status: COMPLETE

**Objective:** at Yusuf's explicit direction, give Yusuf OS a provider-neutral model runtime
instead of hard-coding a provider — route AgentRun completions across a local Ollama daemon and
OpenAI, record honest telemetry, and close a real orphan gap in `ExecutionCoordinator` found while
reading `execute()` closely for this phase.

**Implemented (`server/domain/yusufOS/models/` — the one directory name for this concern):**
- `constants.js` — `CONFIDENCE` tri-state (`KNOWN`/`ESTIMATED`/`UNAVAILABLE`), `ROUTING_POLICIES`
  (`LOCAL_ONLY`/`LOCAL_FIRST`/`OPENAI_FIRST`/`EXPLICIT_MODEL`/`FALLBACK_CHAIN`), `PROVIDER_KINDS`,
  `PROVIDER_HEALTH`. Verified this vocabulary did not already exist anywhere in the codebase before
  adding it.
- `OllamaProvider.js` — read-only HTTP against `http://localhost:11434` (overridable via
  `YUSUF_OS_OLLAMA_BASE_URL`), generic tag-aware discovery via `GET /api/tags` (`"name"` /
  `"name:tag"` both resolve the same way — no gemma4-only branch), `POST /api/show` metadata,
  never issues a pull/create/delete request, structured health
  (`HEALTHY`/`UNREACHABLE`/`TIMEOUT`/`ERROR`). Cost is always `UNAVAILABLE` for this provider by
  construction — Ollama never reports a fabricated monetary cost.
- `OpenAIProvider.js` — reads `process.env.OPENAI_API_KEY` only, no fallback to any other env var
  name used elsewhere in this repo. The key is read once per call, used only for the
  `Authorization` header, and never appears in any returned object, error, log, or audit record
  (asserted by test). Ground-truth provider/model is taken from what OpenAI's own response body
  says served the call, never from the request. 401/429/404/timeout/malformed-JSON map to distinct
  error codes.
- `ModelRouter.js` — resolves a deterministic ordered attempt list per policy and executes it.
  `LOCAL_ONLY`'s attempt list structurally contains only Ollama (nothing to fall through to, even
  under a simulated Ollama failure). `FALLBACK_CHAIN` de-duplicates attempted provider kinds so it
  can never retry one already tried. Every field on the returned envelope (provider/model/usage/
  cost) is taken from what the router itself observed from the provider response.
- `agents/ModelClient.js` gained `RoutedModelClient` — the one production `ModelClient`
  implementation; every real completion goes through `ModelRouter`, no other path to a provider.
  `DeterministicModelClient` (unchanged) remains what the existing deterministic test suite uses,
  so the mocked suite carries no live-network dependency.
- `agents/AgentRunCoordinator.js` gained `recordModelCompletion()`, which persists
  provider/model/policy/fallbackOccurred/latencyMs/usage/cost onto the **existing**
  `yusuf_agent_runs` columns (`modelRef`, `tokenUsage`, `estimatedCostMicros`) — extends the
  existing AgentRun record rather than forking a parallel one, and required **no schema
  migration**: the extra routing metadata (policy/fallbackOccurred/latencyMs/usageConfidence/
  costConfidence) is packed into the existing `modelRef` JSON text column. `estimatedCostMicros` is
  left `null` (never coerced to 0) whenever cost confidence is `UNAVAILABLE`.
- `agents/definitions.js` — Engineering's `modelPolicy` gained `routingPolicy: "FALLBACK_CHAIN"`;
  Reviewer's `modelPolicy` gained `explicitProvider`/`explicitModel` (unset by default) so Yusuf
  can pin the Reviewer to a model/provider independent of Engineering's without touching the
  boundary.
- `errors/YusufOSError.js` gained `ErrorCodes.MODEL_UNAVAILABLE`.
- **ExecutionCoordinator preflight-orphan gap, closed fully:** `availability()`/`preflight()` run
  *before* the claim transaction and before any receipt exists. Previously, either throwing
  propagated straight out of `execute()` with no receipt and no intent-state transition, stranding
  the `ActionIntent` at `AUTHORIZED`/`WAITING_APPROVAL` forever — indistinguishable from "not yet
  attempted". `terminalizePreClaimFailure()` now moves it to `FAILED` (never `FAILED_UNKNOWN`,
  which stays reserved for genuine post-effect uncertainty per the RECONCILE semantics in
  `ARCHITECTURE_INVARIANTS.md`) with an audit record (`execution.preclaim_failed`) and the
  associated run transitioned too. The other case named in scope — `adapter.prepare()` throwing
  *after* the claim (receipt already exists) — was already handled correctly pre-Phase-R; a
  regression test now locks that behavior in alongside the new fix.
- Regression tests: `server/__tests__/yusufOS/integration/executionPreClaimOrphan.test.js` covers
  both the Career and Inbox adapters for the pre-claim `availability()`/`preflight()`-throws path.

**Honest scope note — what this phase did *not* do:** there is still no live agentic loop in this
codebase that calls a `ModelClient` for a real (non-test) completion — `AgentRunCoordinator` and
`ChiefOfStaff` orchestrate task/run state but do not yet invoke a model to decide what to do next.
`RoutedModelClient`/`recordModelCompletion()` are the production-ready plumbing for when that loop
exists; they are not yet wired into a call site that runs today. `DashboardProjection.js`'s
pre-existing `estimatedCostMicros: ... || 0` aggregate-sum pattern (informational display total,
not a per-run field) was noticed but intentionally left alone — out of this phase's scope, noted in
`DEFERRED_WORK.md`.

**Tests:** 76 suites / 956 tests green (baseline 70/913 for this session; +6 new suites, +43 new
tests). One test (`OpenAIProvider.test.js` live smoke) is skipped — no `OPENAI_API_KEY` set in this
environment. Ollama live smoke ran and skipped gracefully — no local daemon reachable at
`http://localhost:11434` in this environment.
**Independent review:** re-read `ModelRouter.js`/providers/`ExecutionCoordinator.js` skeptically
after the implementation looked done; found and fixed the `FALLBACK_CHAIN`+missing-API-key test
assertion being wrong (not a code bug — the router was already correct: no attempt was made, so
`fallbackOccurred` should be `false`, not `true`). No P0/P1 found in the shipped code itself this
pass.

## Phase Q — Application submission seam — status: COMPLETE

**Objective:** at Yusuf's explicit direction ("attempt the end-to-end scenario now"), close the
two real gaps toward the full pipeline he described: Job found -> Research -> Career -> Evidence
check -> Application prepared -> Needs Yusuf -> Approval -> Browser -> Submission verification ->
Inbox monitors reply -> Career state updated -> Command Center. Auditing that list against the
existing implementation showed every other step already existed across Phases L/O/P/Gate E/Gate
F/J — only "Application prepared" and Career actually holding a browser mutation capability were
missing. Deliberately the smallest phase in this run: two changes, no new adapter, no new Agent,
no new Department.
**Design note:** `docs/yusuf-os/gate-b/application-submission.md` (includes the step-by-step
audit table showing what was already built vs. what this phase adds).
**Implemented:**
- **`career.prepare_application`** (LOCAL_WRITE, L1, ALLOW) — stores a local-only
  `applicationNotes` draft on an opportunity that is still `RESEARCHING`. Has **no status
  argument at all** — cannot change status by construction, not just by validation. Requires the
  opportunity to still be `RESEARCHING`; re-checked independently at both the request-builder and
  `CareerAdapter.execute()` checkpoints (same TOCTOU discipline as every other governed write in
  this system). This is the "Application prepared" / "Needs Yusuf" checkpoint — pure inert local
  storage, nothing reads it to auto-trigger anything else.
- **Career Agent granted `browser.submit_form`** — the existing, **completely unmodified** Phase I
  capability (`EXTERNAL_MUTATION`, L3, `REQUIRE_APPROVAL`, registry-mediated formKey +
  allowlisted fields, account-identity binding, page-drift detection, independent post-execution
  verification). First Agent in Yusuf OS to hold it. This is the "Approval -> Browser -> Submission
  verification" step — reachable now, but not usable, since `formRegistry.js` still ships empty
  and the Browser Broker still defaults to disabled (`HUMAN_ACTION_REQUIRED.md` §2 unchanged).
  Once a real submission succeeds, the pre-existing `career.update_status` (unmodified) moves the
  opportunity to `APPLIED` — no new capability needed there.
- **`yusuf_career_opportunities.applicationNotes`** (new nullable column, additive migration
  `20260820190000_add_yusuf_os_career_application_notes`) — free text, same pattern as the
  existing `notes` column, no CHECK constraint needed.
- `CareerAdapter.entryDigest()`'s field set was extended to include `applicationNotes`; every call
  site (record/update/prepare) updated consistently, **including the shared digest computation
  inside Phase P's `InboxAdapter.advance_linked_career_status`** — a cross-adapter dependency that
  independent review specifically verified stayed consistent (a mismatch there would have silently
  broken the Inbox->Career seam's verification without any test catching it by coincidence).
- **"Inbox monitors reply -> Career state updated"** — already fully built in Phase P
  (`inbox.advance_linked_career_status`); unmodified this phase.
- **"Command Center"** — already fully generic (Gate F reads tasks/runs/approvals/audit, not
  per-domain data); no Career-specific Command Center work needed or done.
**The one invariant:** unchanged — `career.prepare_application` passes through the full boundary
like any other governed capability; granting `browser.submit_form` to a new Agent required zero
changes to `PolicyEngine`/`ApprovalService`/`ExecutionCoordinator`, confirming (independent review
checked this explicitly) that capability risk tiers, not agent identity, are what those components
consult.
**Tests:** `careerLifecycle.test.js` gained 3 new cases (drafts, rejects drafting past
`RESEARCHING`, rejects empty notes) and one existing test corrected (Career now legitimately holds
`browser.submit_form`); `agentRuntimeSecurity.test.js` and `browserBrokerSecurity.test.js` updated
so Career is the sole exception to "no Agent holds `browser.submit_form`" and the sole holder of
`career.prepare_application`; `migrationSafety.test.js` updated. **70 suites / 913 tests** (was
70/903 — Phase Q adds tests to existing suites rather than new suites, since it extends the
existing Career adapter/tests rather than building a new domain). See `TEST_BASELINE.md`.
**A migration-naming pitfall caught by the test harness, not by review:** the first version of the
new migration folder was named `..._add_career_application_notes` (missing the `_add_yusuf_os_`
substring `testDatabase.js`'s harness uses to classify Yusuf-owned migrations vs. upstream
AnythingLLM migrations). In the `applyGateCSeparately` test mode, this misclassified the migration
as "upstream" and ran it before any Yusuf table existed, failing with "no such table:
yusuf_career_opportunities". Fixed by renaming to
`20260820190000_add_yusuf_os_career_application_notes`. Worth remembering for any future
additive-column-only migration: the folder name's substring match matters, not just its timestamp
ordering.
**Independent review found no P0/P1/P2** — explicitly verified digest consistency across every
`entryDigest`/`careerEntryDigest` call site (the highest-risk item, since a shared digest formula
changed under two different adapters), confirmed `career.prepare_application` cannot change status
by construction, confirmed `browser.submit_form`'s own code is byte-for-byte unmodified, confirmed
capability isolation (only Career holds both new/newly-granted capabilities), and confirmed the
prepared-draft state is genuinely inert.
**Remaining:** no real job-application form is registered anywhere (`formRegistry.js` still
empty); Browser Broker still disabled by default; no Career-specific Command Center surfacing; no
retention policy on `applicationNotes`. The full literal end-to-end scenario (a real submission
against a real site) cannot run until Yusuf completes `HUMAN_ACTION_REQUIRED.md` §2 and registers
a real form — this phase proves the *mechanism*, not a live integration, same pattern as every
prior phase's local-only proof (Gate D's local git remote, Phase I's fixture-only browser tests).
**Next automatic phase:** to be determined per Yusuf's own direction — check with him before
picking the next slice; no design doc exists yet for Integrations, Model routing/cost, or Command
Center expansion.

## Phase P — Sales/Inbox — status: COMPLETE

**Objective:** durable local-only inbound-message tracking and reply drafting, per Yusuf's explicit
"CONTINUE SALES/INBOX" instruction with five hard requirements (read/mutation split, semantic
capabilities not generic mail/browser commands, identity/thread binding before any future send,
no second Career database, adversarial review of the send-specific attack surface even though no
send capability is built yet).
**Design note:** `docs/yusuf-os/gate-b/sales-inbox.md` (revised after independent review — see
below).
**Implemented:**
- **`yusuf_inbox_messages`** (new table) — `sender`, `subject`, `snippet`, `classification`
  (nullable, five-value CHECK), `status` (four-value CHECK), `draftReplyBody`,
  `linkedCareerOpportunityUuid`, `digest`, principal attribution. First phase table with two
  separate CHECK-constrained columns on one table.
- **`inbox.list_messages` / `inbox.read_message`** (READ, L0, ALLOW).
- **`inbox.record_message`** (LOCAL_WRITE, L1, ALLOW) — always starts at `NEW` with
  `classification: null` regardless of model input (test-proven). Not a live email fetch.
- **`inbox.classify_message`** (LOCAL_WRITE, L1, ALLOW) — closed-enum classification
  (`OPPORTUNITY`/`INTERVIEW`/`REJECTION`/`BOUNCE`/`OTHER`), optional link to an *existing* Career
  opportunity uuid (validated to exist; never creates one). Consolidates the user-spec-named
  `detect_interview`/`detect_rejection`/`detect_bounce`/`extract_opportunity` into one capability
  with a closed enum — a deliberate simplification citing Yusuf's own capability-sprawl warning.
- **`inbox.prepare_reply`** (LOCAL_WRITE, **L2**, ALLOW) — stores a local-only draft; requires
  prior classification; never sends anything to any provider.
- **`inbox.archive_local`** (LOCAL_WRITE, L1, ALLOW) — local bookkeeping only, explicitly not a
  real provider archive (`_local` suffix deliberately distinguishes it from a future
  `gmail.archive_thread`).
- **Transition table** (`inbox/transitions.js`): `NEW -> TRIAGED|ARCHIVED_LOCAL`,
  `TRIAGED -> TRIAGED(self-loop)|DRAFTED|ARCHIVED_LOCAL`, `DRAFTED -> ARCHIVED_LOCAL`,
  `ARCHIVED_LOCAL` terminal. First phase whose one non-forward edge is a **self-loop**
  (reclassification), not a true backward edge — the unit test explicitly separates the two
  detection classes, designed in from the start after the Founder-phase backward-edge test bug
  precedent (not discovered empirically this time).
- **Untrusted-content redaction**: `sender`/`subject`/`snippet`/`draftReplyBody` are wrapped in
  `redactForPersistence(...)` before both digest computation and persistence — the first adapter
  to do this, because email content is genuinely external/attacker-influenceable text, unlike
  every prior phase's Agent/user-asserted fields.
- **`gmail.send_reply`/`gmail.archive_thread`/`gmail.apply_label`** are named only in the design
  note's risk table as future placeholders. **Not implemented, not wired, not reachable** —
  confirmed by grep during independent review.
- **Inbox Department + Inbox Agent** — `allowedCapabilities`: the six `inbox.*` capabilities above
  plus `inbox.advance_linked_career_status` (see below), `knowledge.read`, `knowledge.write`. No
  project/git/browser/memory-write/monitoring/marketing/founder/research capability.
  `autonomyLevel: MANUAL`.
**The Career integration seam (corrected after independent review — see below):** Inbox is
**never** granted `career.record_opportunity` or the raw `career.update_status`. It is granted a
new, narrow capability, **`inbox.advance_linked_career_status`**, that takes an *inbox message
uuid* (not a career opportunity uuid) — there is no argument through which a caller can name a
different opportunity than the one that message is actually linked to. The request builder
(`buildAdvanceLinkedCareerStatusRequest`) and `InboxAdapter.execute()` both independently
re-derive and re-check, from fresh reads, that: the message exists, its
`linkedCareerOpportunityUuid` is set, its `classification` is `INTERVIEW` or `REJECTION`, the
linked opportunity exists, and the requested status is a legal transition — before writing to
`yusuf_career_opportunities`. This is the first Agent in Yusuf OS granted a capability that writes
to a domain other than its own department's table, and the first cross-domain write enforced by
code rather than by agent instruction.
**Independent review found one real P1, fixed before commit:** the first draft of this phase
granted Inbox the raw `career.update_status` capability directly, on the theory that requiring an
existing linkage via `inbox.classify_message` was sufficient. Review correctly identified that
`career.update_status`'s request builder accepts *any* opportunity uuid with no awareness of
`linkedCareerOpportunityUuid` at all — the "seam" was enforced only by the Agent's own
instructions (advisory prose), not by Policy or a request builder, which is exactly the class of
thing the system's invariant says must never be trusted. Fixed by replacing the grant with
`inbox.advance_linked_career_status` as described above, plus two new adversarial tests
(`inboxLifecycle.test.js`): one confirming the capability has no argument to substitute a
different opportunity uuid (it always resolves the target from the message's own linkage), and
one confirming the classification precondition (`OPPORTUNITY` classification cannot trigger a
career status change). Design note and `agentRuntimeSecurity.test.js` updated to match. Everything
else reviewed held up clean on the first pass: no real send/reply/forward/archive surface exists
anywhere (confirmed by grep); server-forced initial status/null classification; closed
classification enum; TOCTOU rechecks at both checkpoints for classify/prepare_reply/archive_local;
redaction reuse confirmed applied to every write; digest consistency; capability isolation
(including the explicit `career.record_opportunity` refusal); migration/schema/constants
alignment.
**Tests:** `inboxTransitions.test.js` (8 unit cases, including the self-loop/true-backward-edge
distinction), `inboxLifecycle.test.js` (13 integration cases, including the corrected Career seam
test and the two new adversarial seam tests), plus `organizationModel.test.js`,
`agentRuntimeSecurity.test.js`, and two Command Center suites updated. **70 suites / 903 tests**
(was 68/897 including a transient unrelated `defaults.test.js` blip, resolved on rerun; up from
68/859 before Phase P). See `TEST_BASELINE.md`.
**Remaining:** no live email connection of any kind (IMAP/Gmail API/SMTP) — this phase is durable
tracking + local drafting only; `gmail.send_reply`/`archive_thread`/`apply_label` named but not
built (the full send-specific attack checklist from Yusuf's requirement 5 — wrong-account send,
BCC/CC injection, reply-all expansion, message-id spoofing, etc. — is pre-recorded in the design
note as the acceptance bar for whichever future phase builds real sends); no retention on
`yusuf_inbox_messages`; no Command Center UI surfacing.
**Next automatic phase:** per the CAVEMAN MODE implementation order and Yusuf's own framing
(Sales/Inbox and Career/Marketing wiring first, then the end-to-end scenario: Job found ->
Research -> Career -> Evidence check -> Application prepared -> Needs Yusuf -> Approval -> Browser
-> Submission verification -> Inbox monitors reply -> Career state updated -> Command Center) —
**COMPLETE as Phase Q, see above.**

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
**Next automatic phase:** Phase P (Sales/Inbox) — **COMPLETE, see above.**

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
