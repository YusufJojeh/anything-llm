# Gate History

## Phase U — Voice / Audio Plane [VERIFIED_BY_TEST, 2026-08-21]

Added the privacy-governed Voice Plane: local-first STT/TTS with explicit browser/cloud opt-in,
bounded and abortable provider calls, safe audio upload handling, push-to-talk and explicit
playback controls in `/os`, Arabic/English handling, and voice commands routed through the real
Chief-of-Staff reasoning loop. L3 speech remains subject to the existing durable approval gate.
Fresh independent review: P0=0/P1=0/P2=2, PASS. Full server: 84 suites, 1,030 passed plus one
optional live Ollama skip. Frontend: 10 suites, 139 passed; lint/build/diff checks passed. Code
commit `cc51b443`.

## Phase T — Real Agentic Reasoning Loop [VERIFIED_BY_TEST, 2026-08-21]

Built the real provider-routed Agent reasoning loop with strict decisions, trust-separated prompt
assembly, governed capability invocation, durable safety leases/counters, honest model capability
matching, bounded streaming provider responses, and independent routed Reviewer verdicts. Fresh
review initially found substantive budget, cancellation, concurrency, prompt, provider, and review
provenance issues; all P1s were fixed. Final review: P0=0/P1=0/P2=3. Full Yusuf OS backend:
51/51 suites, 712 passed, one optional live Ollama smoke skipped. Commit `fe7ebac8`.

## Phase S — Runtime Command Center [VERIFIED_BY_TEST, 2026-08-21]

Completed the interrupted runtime projection/API/UI work and preserved `/` plus the existing
SYSTEM CORE Command Center. Fresh independent review found five P1 and two P2 findings; all were
fixed and the final re-review reported P0=0/P1=0/P2=0. Evidence: full server 77/77 suites (968
passed, one live smoke skipped), frontend 9/9 suites and 133/133 tests, production build, targeted
lint, and diff check. Code commit `47da3247`. Live provider and unlocked real-browser validation
remain explicitly unverified.

## Phase R — Model runtime (ModelRouter) — 2026-08-21 — PASS (no P0/P1)

Built the provider-neutral `ModelRouter` (`server/domain/yusufOS/models/`) with `OllamaProvider`
and `OpenAIProvider`, five deterministic routing policies, and a new `CONFIDENCE` tri-state
(KNOWN/ESTIMATED/UNAVAILABLE). Wired `RoutedModelClient` as the production `ModelClient`
implementation and `AgentRunCoordinator.recordModelCompletion()` to persist the routing envelope
onto the existing `yusuf_agent_runs` record — extended, not forked, and required no schema
migration. Also closed a real orphan gap in `ExecutionCoordinator.execute()`: a pre-claim
`availability()`/`preflight()` throw previously stranded the `ActionIntent` at
`AUTHORIZED`/`WAITING_APPROVAL` with no receipt and nothing to reconcile; it now terminalizes
cleanly to `FAILED`.

### What was built
- `models/constants.js`, `models/OllamaProvider.js`, `models/OpenAIProvider.js`,
  `models/ModelRouter.js`.
- `agents/ModelClient.js` — `RoutedModelClient`.
- `agents/AgentRunCoordinator.js` — `recordModelCompletion()`.
- `agents/definitions.js` — Engineering `routingPolicy`, Reviewer
  `explicitProvider`/`explicitModel`.
- `errors/YusufOSError.js` — `MODEL_UNAVAILABLE`.
- `execution/ExecutionCoordinator.js` — `terminalizePreClaimFailure()`.

### One correction made during independent review
- A new `ModelRouter` test asserted `fallbackOccurred: true` for the case where OpenAI was never
  eligible (no API key) under `OPENAI_FIRST` and Ollama served the request on the first attempt.
  On review this was the test's own expectation that was wrong, not the router: `fallbackOccurred`
  means "an earlier eligible attempt failed and a later one served it", not "a non-preferred
  provider served it". Fixed the test assertion; the router's logic was correct as originally
  written.

### Result
76 suites / 956 tests green (was 70/913 baseline this session). No P0/P1 found in the shipped
implementation. Ollama and OpenAI live smoke tests exist and are gated correctly (both skipped in
this environment — no local daemon, no `OPENAI_API_KEY`).

## Phase Q — Application submission seam — 2026-08-20 — PASS (no findings)

Closes the two real gaps toward the end-to-end job-application scenario Yusuf described, chosen
explicitly by him via AskUserQuestion after Phase P (over "Career/Marketing wiring refinement" and
"define Integrations phase" alternatives). Design note:
`docs/yusuf-os/gate-b/application-submission.md`, which opens with a step-by-step audit table
showing the scenario's steps were almost entirely already built.

### What was built

- `career.prepare_application` (LOCAL_WRITE, L1, ALLOW) — a local-only `applicationNotes` draft on
  an opportunity still `RESEARCHING`, with no status argument at all (cannot change status by
  construction), TOCTOU-rechecked at both the request-builder and adapter-execute checkpoints.
- Career Agent granted the pre-existing, unmodified `browser.submit_form` (Phase I) — first Agent
  to hold it. No code in `BrowserAdapter.js`/`formRegistry.js`/`originPolicy.js` changed.
- Additive migration adding nullable `applicationNotes` to `yusuf_career_opportunities`.

### Two regressions caught by the test/build harness during this phase (not by initial design)

1. **Shared digest formula, cross-adapter coupling.** `CareerAdapter.entryDigest()` gained an
   `applicationNotes` field. Phase P's `InboxAdapter.js` imports and calls this same function
   directly for its `inbox.advance_linked_career_status` seam (Career's integration point for
   Inbox, built in Phase Q's precursor phase). The first regression run after adding the field
   failed `inboxLifecycle.test.js`'s seam test with `verificationStatus: "UNKNOWN"` instead of
   `"VERIFIED"` — the digest InboxAdapter computed for the same row no longer matched what
   CareerAdapter itself would compute, because `InboxAdapter.js`'s call site hadn't been updated
   to include the new field. Fixed by passing `applicationNotes: opportunity.applicationNotes`
   there too. **Lesson recorded in `SESSION_HANDOFF.md`:** any change to a shared digest/hash
   formula must be grepped for every importer, not just the domain's own call sites — cross-domain
   seams create hidden coupling exactly like this.
2. **Migration-naming/harness-classification mismatch.** The new migration folder was first named
   without the `_add_yusuf_os_` substring `testDatabase.js` uses to separate Yusuf-owned migrations
   from upstream AnythingLLM ones in the `applyGateCSeparately` test mode. This misclassified it as
   "upstream," which ran it before any Yusuf table existed, failing with "no such table:
   yusuf_career_opportunities". Fixed by renaming to
   `20260820190000_add_yusuf_os_career_application_notes`.

Both were caught and fixed before commit; the final regression run and the independent review both
passed clean against the corrected code.

### Independent review — no P0/P1/P2

Specifically re-verified digest consistency across every `entryDigest`/`careerEntryDigest` call
site after the fix above (the reviewer's own words: "the highest-risk item, since a shared digest
formula changed and multiple adapters/capabilities depend on it matching"); confirmed
`career.prepare_application` has no status argument anywhere; confirmed `browser.submit_form`'s
own code is byte-for-byte unmodified; confirmed capability isolation (only Career holds both new/
newly-granted capabilities, via the full `agentRuntimeSecurity.test.js` and
`browserBrokerSecurity.test.js` refusal tables); confirmed the prepared-draft state is genuinely
inert (nothing reads `applicationNotes` to auto-trigger anything).

**Result:** 70 suites / 913 tests. Local commit `889f4e46`. Memory commit pending (this commit).

## Phase P — Sales/Inbox — 2026-08-20 — PASS (one P1 found and fixed)

Gives Yusuf OS durable local-only inbound-message tracking and reply drafting, per Yusuf's explicit
five-requirement "CONTINUE SALES/INBOX" instruction. Design note:
`docs/yusuf-os/gate-b/sales-inbox.md` (revised post-review).

### What was built

- **`yusuf_inbox_messages`** (new table, additive migration `20260820180000_add_yusuf_os_inbox`) —
  `sender`, `subject`, `snippet` (nullable), `classification` (nullable, five-value CHECK),
  `status` (four-value CHECK), `draftReplyBody` (nullable), `linkedCareerOpportunityUuid`
  (nullable), `digest`, principal attribution, unique `uuid`. First phase table with two separate
  CHECK-constrained columns.
- Six local-only capabilities (`inbox.list_messages`, `inbox.read_message`,
  `inbox.record_message`, `inbox.classify_message`, `inbox.prepare_reply`, `inbox.archive_local`)
  plus one cross-domain seam capability (`inbox.advance_linked_career_status`, added during the
  P1 fix below).
- Transition table with a self-loop (`TRIAGED->TRIAGED` reclassification), the first phase whose
  one non-forward edge is a self-loop rather than a true backward edge.
- Untrusted-content redaction (`redactForPersistence`) applied to every persisted email field —
  the first adapter to treat its own input as attacker-influenceable text.

### Independent review finding — P1, fixed before commit

**The Career integration seam was not actually enforced in code.** The original design granted
Inbox the raw `career.update_status` capability (an existing Phase L capability from a different
domain), reasoning that Inbox could only reach it after linking a Career opportunity via
`inbox.classify_message`. Independent review determined this reasoning was false:
`career.update_status`'s request builder takes a target uuid directly from the caller's arguments
and has no parameter for, and no awareness of, `linkedCareerOpportunityUuid` at all. Nothing
prevented the Inbox Agent from calling `career.update_status` on any opportunity uuid whatsoever —
one it never linked, one linked to an unrelated message, or a uuid it merely hallucinated or read
out of attacker-influenceable email content that happened to exist and have a legal transition.
The only thing actually stopping this was the free-text instruction in the Agent's mission prompt,
which is advisory, not enforced — precisely the class of gap the system's core invariant ("no
agent may cause a side effect without passing through Policy") exists to prevent.

**Fix:** replaced the `career.update_status` grant with a new capability,
`inbox.advance_linked_career_status`, that takes an **inbox message uuid** as its argument, not a
career opportunity uuid — structurally removing the caller's ability to name an arbitrary target.
Both the request builder (`buildAdvanceLinkedCareerStatusRequest`) and `InboxAdapter.execute()`
independently re-derive, from fresh reads, that: the message exists; its
`linkedCareerOpportunityUuid` is set; its `classification` is `INTERVIEW` or `REJECTION`; the
linked opportunity exists; and the requested status is a legal transition for that opportunity —
before any write to `yusuf_career_opportunities`. Two new adversarial tests confirm this:
(1) the seam capability has no argument to substitute a different opportunity uuid — it always
resolves the target from the message's own linkage; (2) advancing a linked opportunity is refused
when the message's classification is not `INTERVIEW`/`REJECTION` (e.g. `OPPORTUNITY`). Design
note, `agentRuntimeSecurity.test.js`, and `CURRENT_GATE.md` all updated to match. This is the first
phase in the L/M/N/O/P run where independent review caught a real security gap rather than
confirming a clean design, and it happened in the newest, most novel piece of the design (the
cross-domain grant), not in the repeated tracking-adapter boilerplate — worth remembering for any
future cross-domain capability grant.

### Everything else reviewed — clean

No real send/reply/forward/archive/label-apply path exists anywhere against a real provider
(confirmed by grepping for `gmail.` across the repo — the only hits are pre-existing, unrelated
upstream AnythingLLM UI files, never wired into the Yusuf OS registry or adapters). Server-forced
initial `NEW` status and `null` classification on `inbox.record_message` cannot be overridden by
model input. `inbox.classify_message`'s classification enum is closed. TOCTOU rechecks hold at
both the request-builder and adapter-execute checkpoints for classify/prepare_reply/archive_local.
Redaction is applied consistently to every persisted write and folded into digest computation.
`inbox.prepare_reply` requires prior classification and never produces anything resembling a
"sent" state. Migration/schema/constants CHECK-constraint alignment confirmed exact. Capability
isolation confirmed structurally via `agentRuntimeSecurity.test.js`, including the explicit
refusal of `career.record_opportunity` to Inbox (unchanged from the original design) and, after
the fix, the explicit refusal of the raw `career.update_status` to Inbox as well.

**Result:** 70 suites / 903 tests. Local commit `c7a74bb2`. Memory commit pending (this commit).

## Phase O — Research — 2026-08-20 — PASS

Gives Yusuf OS a durable, honestly-transitioned record of research questions Yusuf is investigating
— named only as a future roster label in `PRODUCT_CHARTER.md`/`ROADMAP.md` until this phase. Mirrors
Phase N (Founder)'s pattern with its own transition-table shape. Design note:
`docs/yusuf-os/gate-b/research.md`.

### What was built

- **`yusuf_research_items`** (new table, additive migration
  `20260820170000_add_yusuf_os_research`) — `question`, `category`, `status`
  (`OPEN`/`INVESTIGATING`/`ANSWERED`/`ABANDONED`, DB-level `CHECK` constraint), `notes` (nullable),
  `digest`, principal attribution, unique `uuid`.
- **`research.read_items`** (READ, L0, ALLOW) — by uuid or status.
- **`research.record_item`** (LOCAL_WRITE, L1, ALLOW) — `buildRecordItemRequest` hardcodes the
  initial `status` to `OPEN` regardless of any status the model's call arguments carry.
- **`research.update_status`** (LOCAL_WRITE, L1, ALLOW) — transitions an item, validated against a
  code-owned transition table (`domain/yusufOS/research/transitions.js`) at the same two
  checkpoints as Career/Marketing/Founder.
- **A near-linear transition graph with one reopening edge**: `OPEN -> INVESTIGATING -> ANSWERED`
  is the main pipeline; `ABANDONED` is reachable as a terminal off-ramp from any non-terminal state;
  `ANSWERED -> INVESTIGATING` is the one backward/reopening edge, justified because a *concluded*
  answer can later prove wrong when new evidence surfaces — a different kind of justification than
  Marketing's routine revision edges or Founder's resume-from-pause edge. `ABANDONED` is the only
  true terminal state.
- **Research Department + Research Agent** — one member, `allowedCapabilities`:
  `research.read_items`, `research.record_item`, `research.update_status`, `knowledge.read`,
  `knowledge.write`. No project/git/browser/memory-write/monitoring/career/marketing/founder
  capability (test-enforced at the role-definition level). `autonomyLevel: MANUAL`.

### Independent review

No P0/P1/P2 findings. Reviewer confirmed: `research.record_item` cannot be made to start at any
status other than `OPEN` regardless of model input; both transition-recheck checkpoints exist and
neither can be bypassed via any code path (extra scrutiny given to the `ANSWERED -> INVESTIGATING`
reopening edge specifically, with no bypass, stale-digest, or notes-corruption path found); digest
computation is identical across record/update/verify and matches Founder's equivalent field set;
capability isolation is structural (code-owned allowlist, not database-trusted) and the security
test suite covers both directions; the SQL `CHECK` constraint, Prisma schema, and
`RESEARCH_ITEM_STATUSES` constant are in exact alignment; input validation caps `question`/
`category` at 300 chars and `notes` at 8KB, and the list-read path is bounded at 500 rows.

### Evidence

68 server suites / **859 tests** (was 66/825). Lint clean. Local commit `0416c892`.

## Phase N — Founder — 2026-08-20 — PASS

Gives Yusuf OS a durable, honestly-transitioned record of side-project ventures Yusuf is running —
named only as a future roster label in `PRODUCT_CHARTER.md`/`ROADMAP.md` until this phase. Mirrors
Phase L/M's pattern with its own transition-table shape. Design note:
`docs/yusuf-os/gate-b/founder.md`.

### What was built

- **`yusuf_founder_ventures`** (new table, additive migration
  `20260820160000_add_yusuf_os_founder`) — `name`, `category`, `status`
  (`IDEA`/`VALIDATING`/`BUILDING`/`LAUNCHED`/`PAUSED`/`KILLED`, DB-level `CHECK` constraint),
  `notes` (nullable), `digest`, principal attribution, unique `uuid`.
- **`founder.read_ventures`** (READ, L0, ALLOW) — by uuid or status.
- **`founder.record_venture`** (LOCAL_WRITE, L1, ALLOW) — `buildRecordVentureRequest` hardcodes
  the initial `status` to `IDEA` regardless of any status the model's call arguments carry.
- **`founder.update_status`** (LOCAL_WRITE, L1, ALLOW) — transitions a venture, validated against
  a code-owned transition table (`domain/yusufOS/founder/transitions.js`) at the same two
  checkpoints as Career/Marketing.
- **A branching transition graph, different again from both siblings**: `VALIDATING`/`BUILDING`/
  `LAUNCHED` can each reach `PAUSED` or `KILLED`; `PAUSED` can resume to `BUILDING` (the one
  resume edge) or be `KILLED`. `LAUNCHED` is only reachable via `BUILDING`, and resuming from
  `PAUSED` always lands at `BUILDING` specifically — no chain through `PAUSED` can skip a required
  stage of the main pipeline. `KILLED` is the only true terminal state.
- **Founder Department + Founder Agent** — one member, `allowedCapabilities`:
  `founder.read_ventures`, `founder.record_venture`, `founder.update_status`, `knowledge.read`,
  `knowledge.write`. No project/git/browser/memory-write/monitoring/career/marketing capability
  (test-enforced at the role-definition level). `autonomyLevel: MANUAL`.

### The one invariant, and how it's enforced

Unchanged: both new mutation capabilities pass through `YusufActionBoundary` -> Policy -> Execution
Coordinator -> Verification -> Audit like any other governed capability. Capability isolation is
enforced structurally via the code-owned `allowedCapabilities` registry, not the database.

### Independent review

**Found no P0/P1/P2** — the third phase running (after Career, Marketing) where an adversarial
pass found nothing to fix. This review specifically probed whether the branching+resume graph
could be chained to skip a required stage (e.g. reaching `LAUNCHED` without ever passing through
`BUILDING`, or reviving a `KILLED` venture) and confirmed neither is possible by construction, not
just by convention. Model-supplied-status bypass, TOCTOU in the transition recheck, digest
consistency, capability isolation, and migration/schema/constants alignment were all re-verified
using the same method as Career/Marketing and found clean.

### Tests

`founderLifecycle.test.js` (10 integration cases, including the `PAUSED -> BUILDING` resume edge),
`founderTransitions.test.js` (9 unit cases, including a dedicated assertion that
`PAUSED -> BUILDING` is the only edge that resumes toward the main pipeline), plus
`organizationModel.test.js`, `agentRuntimeSecurity.test.js`, and two Command Center suites
updated. **66 suites / 825 tests** (was 64/792).

## Phase M — Marketing — 2026-08-20 — PASS

Gives Yusuf OS a durable, honestly-transitioned record of marketing content Yusuf is producing —
named only as a future roster label in `PRODUCT_CHARTER.md`/`ROADMAP.md` until this phase. Yusuf
chose "Full vertical slice." Mirrors Phase L (Career)'s pattern closely. Design note:
`docs/yusuf-os/gate-b/marketing.md`.

### What was built

- **`yusuf_marketing_content`** (new table, additive migration
  `20260820150000_add_yusuf_os_marketing`) — `title`, `channel`, `format`, `status`
  (`IDEA`/`DRAFTING`/`READY_FOR_REVIEW`/`SCHEDULED`/`PUBLISHED`/`ARCHIVED`, DB-level `CHECK`
  constraint), `notes` (nullable), `digest`, principal attribution, unique `uuid`.
- **`marketing.read_content`** (READ, L0, ALLOW) — by uuid or status.
- **`marketing.record_content`** (LOCAL_WRITE, L1, ALLOW) — the model supplies `title`/`channel`/
  `format`/optional `notes`; `buildRecordContentRequest` hardcodes the initial `status` to `IDEA`
  regardless of any status the model's call arguments carry (test-proven and independent-review
  confirmed).
- **`marketing.update_status`** (LOCAL_WRITE, L1, ALLOW) — transitions a content item, validated
  against a code-owned transition table (`domain/yusufOS/marketing/transitions.js`,
  `isValidTransition(from, to)`) at the same two checkpoints as Career: an early rejection in
  `buildUpdateStatusRequest` against a fresh read, and an independent re-validation in
  `MarketingAdapter.execute()` against its own fresh read at execute time.
- **Deliberately different from Career's table**: two backward edges exist
  (`READY_FOR_REVIEW -> DRAFTING`, `SCHEDULED -> DRAFTING`) for revision loops a content pipeline
  realistically needs; `PUBLISHED` still has no backward edge (un-publishing is not "back to
  drafting"). Justified in the design note's "Why one backward edge" section; independently unit-
  tested that these two are the *only* backward edges present.
- **Marketing Department + Marketing Agent** — one member, `allowedCapabilities`:
  `marketing.read_content`, `marketing.record_content`, `marketing.update_status`,
  `knowledge.read`, `knowledge.write`. No project/git/browser/memory-write/monitoring/career
  capability (test-enforced at the role-definition level). `autonomyLevel: MANUAL`.

### The one invariant, and how it's enforced

Unchanged: both new mutation capabilities pass through `YusufActionBoundary` -> Policy -> Execution
Coordinator -> Verification -> Audit like any other governed capability. Capability isolation is
enforced structurally via the code-owned `allowedCapabilities` registry, not the database.

### Independent review

**Found no P0/P1/P2** — the second phase running (after Career) where an adversarial pass found
nothing to fix. Specifically confirmed the added backward-edge transition surface does not
introduce a TOCTOU gap or a status-laundering path: every hop, forward or backward, is
independently re-validated against the row actually read at execute time, so the graph having
cycles doesn't weaken the recheck the way it might if validation were only performed once
up-front. Model-supplied-status bypass, digest consistency across record/update/verify/reconcile,
capability isolation, and migration/schema/constants alignment were all re-verified by the same
method used for Career and found clean.

### Tests

`marketingLifecycle.test.js` (11 integration cases, including both backward-edge transitions),
`marketingTransitions.test.js` (9 unit cases, including a dedicated backward-edge-set assertion),
plus `organizationModel.test.js`, `agentRuntimeSecurity.test.js`, and two Command Center suites
updated. **64 suites / 792 tests** (was 62/760).

## Phase L — Career — 2026-08-20 — PASS

Gives Yusuf OS a durable, honestly-transitioned record of job opportunities Yusuf is pursuing —
named only as a future roster label in `PRODUCT_CHARTER.md`/`ROADMAP.md` until this phase. Yusuf
chose "Full vertical slice, same depth as Phase J/K." Design note:
`docs/yusuf-os/gate-b/career.md`.

### What was built

- **`yusuf_career_opportunities`** (new table, additive migration
  `20260820140000_add_yusuf_os_career`) — `company`, `role`, `source` (nullable), `status`
  (`RESEARCHING`/`APPLIED`/`INTERVIEWING`/`OFFER`/`REJECTED`/`WITHDRAWN`, DB-level `CHECK`
  constraint), `notes` (nullable), `digest`, principal attribution, unique `uuid`.
- **`career.read_opportunities`** (READ, L0, ALLOW) — by uuid or status.
- **`career.record_opportunity`** (LOCAL_WRITE, L1, ALLOW) — the model supplies `company`/`role`/
  optional `source`/`notes`; `buildRecordOpportunityRequest` hardcodes the initial `status` to
  `RESEARCHING` regardless of any status the model's call arguments carry — there is no code path
  where a model-supplied status reaches the create call (test-proven and independent-review
  confirmed).
- **`career.update_status`** (LOCAL_WRITE, L1, ALLOW) — transitions an opportunity, validated
  against a code-owned transition table (`domain/yusufOS/career/transitions.js`,
  `isValidTransition(from, to)`, pure and unit-tested in isolation) at two checkpoints: an early
  rejection in `buildUpdateStatusRequest` against a fresh read (mirroring Monitoring's early
  rejection of an unregistered `checkKey`), and an independent re-validation in
  `CareerAdapter.execute()` against its own fresh read at execute time — the same defense-in-depth
  placement as Memory's scope-ownership recheck.
- **Career Department + Career Agent** (`organization/departments.js`, `agents/definitions.js`) —
  one member, `allowedCapabilities`: `career.read_opportunities`, `career.record_opportunity`,
  `career.update_status`, `knowledge.read`, `knowledge.write`. No project/git/browser/memory-write/
  monitoring capability (test-enforced at the role-definition level). `autonomyLevel: MANUAL` —
  task-driven, not `AUTONOMOUS` like Monitoring.

### The one invariant, and how it's enforced

Unchanged: both new mutation capabilities pass through `YusufActionBoundary` -> Policy -> Execution
Coordinator -> Verification -> Audit like any other governed capability. Capability isolation is
enforced structurally via the code-owned `allowedCapabilities` registry
(`isCapabilityAllowedForAgent`/`assertGrantAllowed`), not the database — confirmed by independent
review to actually block a hypothetical bad DB grant, not just discourage one.

### Independent review

**Found no P0/P1** — the first phase in this run where an adversarial pass found nothing blocking
on its first attempt (Knowledge/Memory and Monitoring each had a real P1 that self-review missed).
The review specifically targeted:

- **Model-supplied-status bypass**: confirmed not exploitable — `buildRecordOpportunityRequest`
  hardcodes `payload.status = RESEARCHING`, and `CareerAdapter.execute()`'s create branch reads
  only the server-set `payload.status`, never a raw model argument.
- **TOCTOU between request-building and execution**: confirmed not a gap —
  `CareerAdapter.execute()` performs an independent fresh read and re-validates
  `isValidTransition(existing.status, target.status)` against that fresh row before writing, not
  just trusting the request builder's earlier check.
- **Digest consistency across record -> update -> verify -> reconcile**: walked by hand and
  confirmed consistent; `reconcile()`'s narrower existence-plus-status check (vs. Knowledge/
  Memory's expected-digest recomputation) is accurately documented as a real, accepted limitation,
  not an understated gap, because `career.update_status`'s `canonicalPayload` carries only `notes`.
- **Capability isolation**: confirmed the Career Agent's `allowedCapabilities` never reaches
  project/git/browser/memory-write/monitoring, and that `assertGrantAllowed` would structurally
  refuse a hypothetical bad DB grant rather than silently trusting it.
- **Migration/schema/constants alignment**: confirmed the migration's `CHECK` constraint values,
  `schema.prisma`'s columns, and `CAREER_OPPORTUNITY_STATUSES` match exactly.
- **One P2 (accepted, folded in)** — `notes` cannot be cleared via `career.update_status`, only
  replaced with new text, because the adapter only overwrites `notes` when the payload carries an
  actual string. This is intentional (mirrors the transition table's own "no rewriting history"
  philosophy — starting over is a new opportunity row) but wasn't stated anywhere. **Fixed** by
  adding a one-line code comment in `CareerAdapter.js` rather than filing it as a separate defect.

### Evidence

**62 server suites / 760 tests**, 0 failed (was 60/734). Lint clean
(`npx eslint domain/yusufOS`, zero output after one auto-fix pass for formatting). Local commit
`0ae1266c` — "feat(yusuf-os): Phase L — Career opportunity tracking" (20 files changed, 990
insertions). Not pushed.

### What remains

No job-board/email integration; no resume/cover-letter generation; no retention on
`yusuf_career_opportunities`; no Command Center UI surfacing. See `DEFERRED_WORK.md`.

## Phase K — Monitoring — 2026-08-20 — PASS

Gives Yusuf OS a real Agent that watches Yusuf OS's own internal health signals and durably
records what it found — the first real use of `AUTONOMY_LEVELS.AUTONOMOUS`, which the Organization
model deliberately defined but left unused ("for a future Agent that may start work without being
handed an objective, e.g. a Monitoring Agent reacting to a real signal"). Yusuf chose "Full
vertical slice, same depth as Phase J." Design note: `docs/yusuf-os/gate-b/monitoring.md`.

### What was built

- **`yusuf_monitoring_checks`** (new table, additive migration
  `20260820120000_add_yusuf_os_monitoring`) — append-only check history: `checkKey`, `status`
  (`OK`/`WARN`/`BREACH`, DB-level `CHECK` constraint, plain `String` in `schema.prisma` per the
  existing project convention), `observedValue`/`threshold` (JSON snapshots), `summary`, `digest`,
  principal attribution, unique `uuid`.
- **`system.read_health`** (READ, L0, ALLOW) — `SystemHealthAdapter` returns the raw four-signal
  snapshot (pending approvals, unresolved intents, control-plane health via `auditKeyConfigured()`,
  kill-switch state) with no interpretation, no external effect.
- **`monitoring.record_check`** (LOCAL_WRITE, L1, ALLOW) — the model supplies only a `checkKey`;
  `MonitoringAdapter.execute()` recomputes the snapshot itself at execute time and derives
  `status`/`summary` via `monitoring/thresholds.js`'s `evaluateSystemHealth` — mirrors
  `recordEvidence`'s `VALIDATION`-kind pattern from Gate E. Test-proven: a caller supplying
  `status: "BREACH"` and a fake `observedValue` in its call arguments is silently ignored.
- **Monitoring Department + Monitoring Agent** (`organization/departments.js`,
  `agents/definitions.js`) — one member, `allowedCapabilities`: `system.read_health`,
  `monitoring.record_check`, `knowledge.read`, `knowledge.write`. No project/git/browser/
  memory-write capability (test-enforced at the role-definition level).
  `autonomyLevel: AUTONOMOUS` — first real use of the label.
- **New structural invariant**: no `AUTONOMOUS`-level Agent may ever be defined with a capability
  whose `defaultRisk` is above `L1` or whose `operationClass` is `EXTERNAL_MUTATION`, enforced by a
  `test.each`-style loop in `organizationModel.test.js` over every real `AgentDefinition`, looking
  each capability up via the actual registry (`getCapability`), not a hardcoded list. Explicitly
  drawn as the same class of concern as the previously-fixed scheduled-job auto-approve
  vulnerability — a guard against "autonomous" ever quietly becoming a second, softer path around
  approval.

### The one invariant, and how it's enforced

Unchanged: both new capabilities pass through `YusufActionBoundary` -> Policy -> Execution
Coordinator -> Verification -> Audit like any other governed capability. `autonomyLevel` is an
orchestration-only label, never consulted by `PolicyEngine`/`ApprovalService`/the capability
registry — confirmed still true by the Organization model's existing grep-based regression test,
which this phase did not need to touch.

### Independent review

Found one real P1, no other issues.

- **P1 (fixed)** — the fix for a genuine self-observation paradox (the intent for a
  `system.read_health`/`monitoring.record_check` call is itself `EXECUTING` at the moment that same
  call reads the unresolved-intents count, so it would always see at least one "unresolved" intent
  — itself) was originally too broad: it excluded the *whole* `monitoring.record_check` capability
  from the count. Independent review caught that `monitoring.record_check` performs a real Prisma
  write that CAN legitimately get stuck `EXECUTING`/`FAILED_UNKNOWN` (a DB error after commit but
  before verification, a crash mid-call) — exactly the class of unproven-effect state this signal
  exists to catch — and a capability-wide exclusion would make it structurally invisible to
  Monitoring's own judgment forever, not just for the one in-flight call. Also noted
  `DashboardProjection#systemStatus` does not apply any such exclusion, so a human looking at the
  dashboard would still see a stuck effect that the autonomous Monitoring Agent — the whole point
  of this phase — would not. **Fixed** by changing `readSystemHealthSnapshot` to accept
  `{ excludeIntentId }`: `system.read_health` (which persists nothing, so it can never itself be a
  stuck effect) keeps the safe whole-class exclusion; `monitoring.record_check` is excluded only by
  the exact in-flight intent's own id, threaded from `prepared.intent.id` in both adapters. Added a
  regression test (`monitoringLifecycle.test.js`, "a stuck monitoring.record_check intent from a
  prior call is not hidden from a later check") that manufactures a `FAILED_UNKNOWN` intent from a
  *previous* call and asserts a later check still reports `WARN`. Updated the design note with a
  new "A self-observation hazard, caught by independent review" section documenting the
  wrong-then-right fix.
- **Everything else reviewed checked out clean**: the verdict-derivation path cannot be spoofed by
  the model (confirmed by the adapter code and by test); the AUTONOMOUS risk-ceiling test is
  registry-driven, not a hardcoded list, so it stays correct as capabilities evolve; Monitoring's
  capability set has zero path, direct or chained, to any external mutation; `reconcile()`'s
  narrower existence-only check (vs. Knowledge/Memory's expected-digest recomputation) is
  accurately documented as a real, accepted difference, not an understated gap, because the
  verdict is derived from a live snapshot at execute time rather than anything the intent recorded
  up front; the migration/schema change is additive-only with a correct unique index and DB-level
  `CHECK` constraint.

### Evidence

**60 server suites / 734 tests**, 0 failed (was 58/705). Lint clean
(`npx eslint domain/yusufOS`, zero output). `git diff --check` clean. Local commit `d9a56e1f` —
"feat(yusuf-os): Phase K — Monitoring, the first AUTONOMOUS-level Agent" (23 files changed, 1112
insertions). Not pushed.

### What remains

No scheduled trigger for Monitoring runs; only one registered `checkKey`; no retention on
`yusuf_monitoring_checks`; no Command Center UI surfacing; no second `AUTONOMOUS` Agent. See
`DEFERRED_WORK.md`.

## Phase J — Knowledge/Evidence/Memory split — 2026-08-20 — PASS

Implements ADR-008 (accepted at Gate B, never built until now): Conversational Memory, sourced
Knowledge, and execution Evidence are separate concepts, previously living undifferentiated inside
`yusuf_run_evidence`. Yusuf chose the "Full vertical slice" scope: design note, schema, governed
read/write capabilities, and real Agent wiring — same depth as Gate H/I. Design note:
`docs/yusuf-os/gate-b/knowledge-evidence-memory.md`.

### What was built

- **Evidence classification + retention** (additive to `yusuf_run_evidence`): `evidenceClass`
  (`PUBLIC_METADATA`/`SANITIZED_OUTPUT`/`SENSITIVE_OPERATIONAL`/`SCREENSHOT`/`SECRET_FORBIDDEN`),
  `expiresAt` (derived from a code-owned `EVIDENCE_RETENTION_DAYS` table; `SECRET_FORBIDDEN`
  deliberately has no entry), `tombstonedAt`. `AgentRunCoordinator.recordEvidence` now refuses
  `SECRET_FORBIDDEN` outright (`ACTION_FORBIDDEN`) rather than ever persisting it.
  `EvidenceRetention.tombstoneExpiredEvidence(db, {now})` truncates `summary`/`payload` on expired
  rows to a fixed marker, preserving `digest`/`evidenceClass`/`kind`/`runId`/`taskId`, and writes one
  `evidence.tombstoned` audit event per row. Not agent-invokable, not a capability — plain
  system-owned truncation of data Yusuf OS already owns, at the same trust tier Gate E already gave
  Evidence. No scheduled trigger wired yet (deferred).
- **Knowledge** (`yusuf_knowledge_entries`, new table) — sourced facts (`AGENT_DERIVED`/
  `USER_PROVIDED`/`DOCUMENT_CITED`) via `knowledge.read`/`knowledge.write` (L0/L1, ALLOW). Every
  write is a true create with a server-minted `uuid` (`randomUUID()`, never model-supplied) — two
  identical-content writes produce two distinct rows, proven by test.
- **Memory** (`yusuf_memory_entries`, new table) — scoped key/value facts
  (`PERSONAL`/`PROJECT`/`AGENT`/`TASK`/`CONVERSATION`) via `memory.read`/`memory.write` (L0/L1,
  ALLOW). `@@unique([scope, scopeRef, key])` makes a write a true upsert; original
  `createdByPrincipalType`/`Id` are set only on create, never overwritten by a later update.
- **First-ever governed adapter whose "external effect" is a Prisma write, not something outside
  the schema.** Decided (design note, "New adapter class" section) that Knowledge/Memory still go
  through the full Intent -> Policy -> Execution -> Verification -> Audit boundary — unlike
  Evidence's ungoverned domain-service write — because these are new facts an Agent *asserts from
  its own reasoning*, the same trust boundary as `project.write_file`.
- **Memory scope-ownership enforcement** (`adapters/memory/scopeIdentity.js`,
  `assertScopeOwnership`): checked server-side against `intent.agentId`/`taskId`/
  `requestedByPrincipalType` at both `preflight()` and `prepare()` (defense in depth, mirroring
  `assertRepositoryMatchesTask`'s placement for git/project capabilities — for the identical
  structural reason: request builders never see the intent's identity fields, only the adapter
  does). `PERSONAL` scope is hard-refused for any non-`USER` principal regardless of grant
  (`SCOPE_FORBIDDEN_FOR_AGENT`); `AGENT`/`TASK`/`CONVERSATION`/`PROJECT` scope each require
  `scopeRef` to match the acting identity (`SCOPE_NOT_OWNED` otherwise).
- **Agent grants** — the first *granted* (not merely reachable) capabilities in this pattern:
  Engineering: `knowledge.read`, `knowledge.write`, `memory.read`, `memory.write`. Reviewer:
  `knowledge.read` only. Chief of Staff: untouched, `[]` — considered and rejected in the design
  note (an orchestrator that can read/write Memory is a step toward it acting on its own judgment
  rather than delegating, which the Organization model's `autonomyLevel` for Chief of Staff already
  says it should not do yet).

### Independent review

Found one real P1 and three P2s, none blocking.

- **P1 (fixed)** — `tombstoneExpiredEvidence` performed the row-truncation `update()` and the
  `audit.append()` call as two separate, un-transacted operations. A failure in the audit call after
  truncation would destroy evidence content with zero audit trail, and the row's `tombstonedAt` gate
  would permanently exclude it from any future retry — directly undermining ADR-008's own stated
  invariant against silently erasing audit history. **Fixed** by wrapping both operations in one
  `db.$transaction`, using the existing `AuditService.appendInTransaction(tx, ...)` method (already
  used by `IntentService.create`) instead of the queued `audit.append()`. Verified by a dedicated
  test that unsets `YUSUF_OS_AUDIT_HMAC_KEY` mid-test to force the transaction to fail, then asserts
  the row is left completely untouched (not half-truncated) and the failure surfaces in
  `result.errors`.
- **P2 (accepted, not fixed)** — Knowledge/Memory have no retention/expiry mechanism of their own;
  documented as a known limitation.
- **P2 (accepted, not fixed)** — the migration's `CHECK` constraints on `sourceType`/`scope` aren't
  mirrored in `schema.prisma`'s plain-`String` column declarations. Verified via `grep` that
  `yusuf_handoffs.status` already exhibits the identical pattern in already-shipped Gate E schema —
  concluded this is established codebase convention, not a new inconsistency, and left it alone
  rather than remove a real DB-level security backstop for cosmetic consistency.
- **P2 (accepted, not fixed)** — a `preflight()` throw does not transition the intent to a terminal
  `FAILED` state (`ExecutionCoordinator`'s failure-handling try/catch only wraps `prepare()`/
  `execute()`). Confirmed pre-existing across every capability, not introduced by this phase; left
  as an accepted, documented, out-of-scope framework gap.

**Evidence:** 58 suites / 705 tests (was 56/666), lint clean. See `TEST_BASELINE.md`. Local commit
`713bb560` — "feat(yusuf-os): Phase J — Knowledge/Evidence/Memory split", 19 files changed, 1909
insertions.

**What remains:** no Command Center UI surfacing this phase; no scheduled retention trigger; no
Memory Curator role. See `DEFERRED_WORK.md`.

## Organization model — Department / AutonomyLevel — 2026-08-20 — PASS

Gives future specialist roles a place to attach to before they exist, without producing "137 fake
agents." No prior gate-b doc covered this — design note written first:
`docs/yusuf-os/gate-b/organization-model.md`.

### What was built

- `server/domain/yusufOS/organization/departments.js` — a code-owned `Department` registry (not a
  database table) grouping the existing three `AgentDefinition`s into two real Departments:
  `system_core` (Chief of Staff alone, matching its zero-capability design) and `engineering`
  (Engineering + Reviewer, the one department with a real delegation relationship and real
  capabilities). `getDepartment`/`listDepartments`/`departmentForAgent` helpers.
- `AUTONOMY_LEVELS` (`MANUAL`/`SUPERVISED`/`AUTONOMOUS`) added to `constants.js`, and an
  `autonomyLevel` field added to each `AgentDefinition` — Chief of Staff is `SUPERVISED`
  (delegates freely once given an objective, but holds zero capability), Engineering and Reviewer
  are `MANUAL`. Nothing is `AUTONOMOUS` yet; the level exists for a future Agent that may start
  work without being handed an objective.
- Deliberately **not** built: no new Agent, no new database table, no new Job/Workflow primitive.
  `yusuf_tasks`/`yusuf_agent_runs`/`yusuf_handoffs` already are the Job/Workflow primitives; this
  phase only labels which Department they belong to, derived at read time from the assigned
  Agent, never stored redundantly.

### The one invariant, and how it's enforced

Department and AutonomyLevel must never be consulted by `PolicyEngine`, `ApprovalService`, or the
capability registry to decide whether an action requires approval — that stays entirely owned by
the registry's `defaultRisk`/`defaultOutcome`, a property of the action, not of who's asking or how
"autonomous" they're labelled. This is the same class of vulnerability as the previously-fixed
scheduled-job auto-approve bug: a label meaning "more autonomous" must never become a second,
softer path to skipping approval. Enforced by a `test.each` regression test in
`organizationModel.test.js` that greps `PolicyEngine.js`/`ApprovalService.js`/`registry.js`/
`IntentService.js`/`ExecutionCoordinator.js` source for any reference to the organization module,
`autonomyLevel`, or `departmentKey`, and fails if one appears.

### Independent review

Found no P0/P1. Confirmed the grep-based invariant test is sound (not trivially gameable — only a
contrived dynamic-key-construction bypass would evade it, not a realistic one), confirmed
`departments.js` and the `AgentDefinition` `departmentKey` fields agree bidirectionally with no
stale references, and confirmed no existing test does whole-object equality on an `AgentDefinition`
that the two new fields would break.

**Evidence:** 56 suites / 666 tests (was 55/652), lint clean. See `TEST_BASELINE.md`.

**What remains:** a third Department appears only alongside the phase that builds its first real
Agent (Research, Monitoring, Marketing, Career, Founder, Memory Curator are all still names only);
no Command Center UI change this phase. See `DEFERRED_WORK.md`.


## Phase I — governed browser mutations — 2026-08-20 — PASS

The first browser mutation. `browser.submit_form`: an Agent supplies only a `formKey` and
allowlisted field values, never a selector or URL — the server resolves the exact origin, path,
submit control and permitted fields from a code-owned registry (`formRegistry.js`, empty by
default; a form appears there only after code review). Governed as an L3 external mutation through
the standard chain: Intent -> Policy -> Approval -> ExecutionCoordinator -> Verification -> Audit.

### What was built

- `formRegistry.js` — `resolveForm`/`assertFieldsAllowed`/`assertPageMatchesForm`. Unknown form
  keys, disallowed/missing/oversized/non-string field values, and origin/path mismatches are all
  forbidden, not improvised.
- `mutationGuards.js` — `accountIdentityDigest` (only a session-*verified* identity produces a
  digest; a page merely claiming an identity can never satisfy a bound constraint),
  `assertAccountMatches`, `assertPageUnchanged`, and the `effectCertain` classification helpers
  (`classifyFailure`/`certainFailure`/`uncertainFailure`) that keep an uncertain driver outcome from
  ever being retried blindly.
- `requestBuilders.js` — `buildSubmitFormRequest`, which reads the live origin/page/identity at
  request-build time (mirroring `git.push_feature_branch`'s live remote-fingerprint read) so the
  eventual approval binds to *this* rendered page and *this* authenticated account.
- `BrowserAdapter.js` extended: `preflight()` computes the live `targetIdentityDigest`/
  `resourceVersion` the framework's generic live-preflight recheck compares against what was bound
  at approval time; `execute()` re-checks origin/path/account/page-content immediately before the
  click (defense in depth on top of the framework check); `#verifySubmission`/`reconcile`
  independently re-read the page against the descriptor's verification signal rather than trusting
  the driver's own report of success.
- `FixtureBrowserDriver`/`CdpBrowserDriver` both gained `submitForm()`.
- No Agent role's allowlist was touched — `browser.submit_form` is reachable through
  `toolBinding.js` but not grantable, same discipline as Phase H.

### Three real bugs the independent review found after tests were green (self-review missed all three)

1. **P0 — field selectors never reached the real driver.** `assertFieldsAllowed` returned only
   `{name: value}`; `requestBuilders.js` and `BrowserAdapter.execute()` passed that shape straight
   through; `CdpBrowserDriver.submitForm` did `page.type(rule.selector || name, ...)` where `rule`
   was the bare string value (no `.selector` property), silently falling back to typing into a
   selector equal to the field's semantic name. On a real page this either throws or types into the
   wrong element. The fixture driver's own doc-comment said it "never inspects fields for
   correctness," which is exactly why 41 passing tests didn't catch it. **Fixed:** selectors now
   travel as `{selector, value}` end-to-end, attached in `BrowserAdapter.execute()` from the
   descriptor immediately before the driver call — never trusted from payload. The fixture driver
   was also tightened to throw if a field arrives without a selector, so this class of regression
   now fails a test, not just a future review.
2. **P1 — `assertPageUnchanged` was written and unit-tested but never called from production code.**
   The adapter's own comment claimed a "final re-check, immediately before the click," but the
   re-check covered origin/path/account only, not page content — leaving a real window between the
   framework's one `preflight()` call and the actual click where the rendered page could change
   without navigating away. **Fixed:** `execute()` now re-reads the page and calls
   `assertPageUnchanged(prepared.resourceVersion, page.contentDigest)` in that same pre-effect
   block; `prepare()` was extended to carry `intent.resourceVersion` through for this comparison.
3. **P2 — a `page.click()` failure was unconditionally tagged `effectCertain: false`,** even though
   Puppeteer only rejects there when the click never dispatched at all (bad/stale selector) — a
   certain, pre-effect failure, not an unknown one. **Fixed:** click and navigation are now
   `Promise.allSettled` separately, so a failed click reports `effectCertain: true` while a
   navigation timeout after a successful click (which is not itself an error — an AJAX-submitting
   form need never navigate) is left to independent verification rather than treated as a driver
   exception at all.

### Reachable but deliberately not granted

No `AgentDefinition` in `agents/definitions.js` lists any `browser.*` capability, confirmed by a
dedicated regression test in `browserBrokerSecurity.test.js` — identical invariant to Phase H.

**Evidence:** 55 suites / 652 tests (was 53/607), lint clean. See `TEST_BASELINE.md`.

**What remains:** real-browser validation of `CdpBrowserDriver.submitForm` (see
`HUMAN_ACTION_REQUIRED.md`); granting the capability to an Agent; registering an actual production
form. See `DEFERRED_WORK.md`.


## Phase H — Browser Broker (read-only) — 2026-08-18 — PASS

First capability of the autonomous continuation. ADR-005 had left the browser bridge
"contract-only until a safe attachment mechanism is selected"; Phase H selects it, implements
read-only observation, and stops there.

### Attachment decision — ADR-011

CDP attach to a browser **the operator launched himself**, behind three independent opt-ins:
`YUSUF_OS_BROWSER_BROKER_ENABLED=true`, `puppeteer-core` installed (deliberately *not* a declared
server dependency, so a default install carries no browser-automation surface), and Chrome already
running with `--remote-debugging-port`. The broker **connects**; it never launches a browser and
never creates a profile.

### What was built

- `originPolicy.js` — exact-host allowlist, https-only except loopback, unparseable URLs refused,
  empty allowlist observes nothing, and `safeUrl()` which drops query and fragment because those
  routinely carry session ids and reset tokens.
- `pageSanitizer.js` — the security centre. Separates hidden text from visible text rather than
  silently merging it, counts known injection phrasings as an operator signal (explicitly *not*
  claimed as a filter), redacts secret-shaped strings with the same `redactString` used for audit
  metadata, bounds every field, and stamps everything `UNTRUSTED_WEB_CONTENT`.
- `drivers/` — `CdpBrowserDriver` (real attach) and `FixtureBrowserDriver` (every test). The
  adapter, origin policy and sanitizer are identical on both paths, so tests exercise the real
  governance code.
- `extractPageState.js` — the single fixed read-only routine that runs in-page. It exists precisely
  so Agents never get to run any JavaScript of their own.
- `BrowserAdapter.js` — six typed read capabilities. No click, type, submit, navigate or evaluate.

### Two gaps the independent review found after the tests were green

1. **`browser.*` resolved to no adapter**, so the whole phase was unreachable shelf-ware. Wired
   into `toolBinding.adapterForCapability`.
2. **The broker was invisible in System Health.** Added to `DashboardProjection`, where it honestly
   reports `UNAVAILABLE` until the operator opts in.

### Reachable but deliberately not granted

No role's code-owned allowlist includes any `browser.*` capability, so `assertGrantAllowed` still
refuses every grant. Reachability and authority are separate steps; the Agent that actually needs
browser reads (Research/Career) will arrive carrying them. A test asserts this stays true.

### Evidence

45 new backend tests (23 unit, 22 adversarial). Adversarial coverage: lookalike origins
(`github.com.attacker.net`, `evil-github.com`), subdomain escalation, scheme downgrade,
`javascript:`/`file:`/`data:`, empty allowlist, **TOCTOU** (a tab that navigates after being
listed), vanished tab, missing tabId, hidden injected instructions, secret-shaped page text, a
token in the URL, cross-origin frames, page-changed-between-reads, and an account label a page
merely *claims* versus one the session verifies.

Server suite: **53 suites / 607 tests** (was 51 / 559). Lint clean, `git diff --check` clean.

### Honest limits

- The CDP driver has **never been run against a real browser** — `puppeteer-core` is not installed
  and no allowlist is configured. Everything proven here is proven against fixtures. Recorded in
  `KNOWN_RISKS.md`, not glossed.
- Attachment requires a browser Yusuf has launched, so Yusuf OS cannot claim 24/7 browser
  capability. That limit is documented rather than engineered around.


## Gate G.1 — Visual fidelity & premium polish — 2026-08-18 — PASS

Visual-only pass over the existing `/os` Command Center. **No architecture change, no new product
capability, no backend change** (`git diff HEAD -- server/` is empty).

### What changed

- **Central core +26% dominance.** `CORE_RADIUS` 86 → 108 against an unchanged `NODE_RADIUS` 34,
  so the core/agent ratio moved 2.53x → 3.18x and the rendered core went 135px → **170px** at
  1440x900 — inside the same 1000-unit viewBox, so the viewport-fit fix from the previous gate is
  untouched (page height still exactly 900 at 900). Layered treatment: ambient halo, a status ring
  that is dashed-and-rotating **only** while the staff is genuinely working, a structural boundary
  ring, a radial-fill disc, and a three-level type hierarchy (YUSUF OS 30px/700 → CHIEF OF STAFF
  13px tracked → system state 14px in the status colour) separated by a hairline.
- **Adaptive constellation spacing** (`constellationLayout.js`). Radius is now chosen from roster
  size — 1-3 agents share a compact 216-unit orbit, 4-6 sit at 268, 7-9 at 322, and 10+ gain a
  second ring; a very large roster gains a third. Ring capacity is **derived from the real chord
  length** between neighbours rather than guessed, so "no overlap" is a property of the algorithm.
  Three agents now sit 306 units apart instead of 599 — the small-roster emptiness Yusuf flagged.
- **Agent role identity** (`agentRoles.js`). Code-owned role → two-letter glyph, shown in both the
  constellation node and the roster row. Roles carry **no colour**: colour stays reserved for
  status, enforced by a test. Unknown keys get a deterministic fallback glyph, so a growing roster
  degrades gracefully.
- **Status halos and a real activity arc.** Every node carries a status ring; an arc appears only
  when the projection asserts `activeTaskId`/`currentRunId`, and rotates only while `RUNNING`.
- **Relationship semantics** (`edgeKind`). Derived from the persisted `yusuf_handoffs.reason`, so
  review and delegation edges are distinguishable without inventing a classification. Direction
  markers at every edge midpoint; flow animation still only on an `ACCEPTED` handoff.
- **Quieter rail.** Now shares the canvas surface instead of a raised panel, hairline border,
  active section marked by a leading rule rather than an admin pill, and icon-only below 2xl —
  desktop footprint **152px → 57px (-63%)** with 44px hit targets and accessible names intact.
- **Depth and micro-polish.** Three-level depth tokens, a fixed z-scale, one shared Expo-out
  easing, a `.yos-canvas` stage treatment with vignette and dashed orbit guides, a shared
  `.yos-row` hover/selection treatment, and a status *readout* (hairline-divided, tabular numerals,
  colour only on non-zero counts) replacing the three KPI-style tiles.

### Core identity correction (post-acceptance)

The central node originally read `YUSUF OS / CHIEF OF STAFF / <state>`. Chief of Staff is a **real,
independent AgentDefinition** with its own constellation node, role glyph and server-owned status,
so the core was duplicating an Agent's identity — leaving the operator unable to tell whether the
centre was the machine or a member of staff. The core now reads `YUSUF OS / SYSTEM CORE / <state>`
in English and `نظام يوسف / نواة النظام / <state>` in Arabic. Guarded by regression tests asserting
that the core label is the system, that `chief_of_staff` still resolves to its own `CS` identity,
and that no Agent role label may ever equal the core label.

### Two real defects found by reading the installed skills, not by looking

- `h-screen` on the shell — wrong on mobile browsers where the URL bar resizes the viewport. Now
  `h-dvh` (`ui-design`: "NEVER use h-screen, use h-dvh").
- An arbitrary `z-[60]` in the drawer — replaced with a `--yos-z-overlay` token (`ui-design`:
  "Z-index MUST use a fixed scale").

### Independent review finding, fixed

The new risk badge duplicated the risk level into the attention row's accessible name ("L3, L3
approval, ..."). The badge is visual emphasis of text already in the sentence, so it is now
`aria-hidden`.

### Evidence

Measured in a real browser via the dev-only fixture harness, across 10 scenarios and 4 viewports in
both languages: **zero node overlaps, zero label collisions, zero clipping** at 1, 3, 6, 10, 24, 40
and 48 agents and with long names in English *and* Arabic (labels truncate at 18 chars with an
ellipsis). RTL keeps the rail on the right, opens the drawer from the left and mirrors directional
icons. All four animated elements neutralize to ~0 under reduced motion with state still readable.
Frontend **109 tests** (was 78), lint clean, production build clean and free of harness code.


## Gate G — AI Staff Command Center frontend — 2026-08-18 — PASS

The first frontend gate. `/os` implemented against the Gate F projections; `/` untouched.

### What was built

**Frontend feature module** `frontend/src/features/yusufOS/`:
- `api/client.js` — control-plane client. Uses a **relative** base (`/api/yusuf-os-ui`),
  deliberately ignoring `VITE_API_BASE`, so the session cookie stays same-origin instead of
  requiring credentialed CORS. A Vite dev proxy covers development; `xfwd` stays off because the
  control plane rejects forwarding headers.
- `state/statusSemantics.js` — the single status vocabulary. Backend enum → tone, with three
  independent carriers (colour, icon, translated label). An unrecognised status resolves to
  `unknown` everywhere at once rather than reading as healthy in one component.
- `state/commandCenterModel.js` — projection → view model. Enforces "no fake data": real zero and
  unknown are different values, an edge whose endpoint is missing from the roster is dropped and
  counted rather than drawn, and core state is derived in strict precedence with security
  conditions outranking activity.
- `state/constellationLayout.js` — deterministic radial layout, 0..N agents, wraps to a second
  ring past nine. No graph library.
- `realtime/eventReducer.js` — the SSE contract. Duplicates, out-of-order arrival, sequence gaps,
  server resets, unknown schema versions, connection loss and visibility restore all resolve to
  "refetch the snapshot". The stream never becomes a source of truth.
- `state/YusufOSProvider.jsx` — snapshot-first load, then stream; one debounced refetch per
  reconciliation trigger.
- `components/` — constellation, roster (the accessible equivalent), attention queue, agent
  detail, system health, drawer, unlock screen, shell, primitives.
- `i18n/` — English + Arabic in a dedicated `yusufOS` namespace, so `common` stays verifiable
  across its ~24 locales.

**Routes** (`frontend/src/pages/YusufOS/`): `/os`, `/os/agents`, `/os/tasks`, `/os/tasks/:taskId`,
`/os/approvals`, `/os/approvals/:approvalId`, `/os/runs`, `/os/runs/:runId`, `/os/projects`,
`/os/system`.

**Backend additions (additive, read-only except the session routes):**
- `server/domain/yusufOS/api/uiSession.js` — the browser bootstrap. Control token exchanged once
  over loopback for an httpOnly + SameSite=Strict in-memory session with idle *and* absolute
  expiry, plus a double-submit CSRF token held only in page memory. Same secret, same
  `timingSafeEqual`, same loopback rule as the bearer guard. `/api/yusuf-os/*` unchanged.
- `server/domain/yusufOS/projections/DetailProjections.js` — uuid-addressed roster, task, run and
  approval-review projections. Curated shapes, not row dumps: no canonical payload/target JSON,
  no principal identifiers, all prose redacted and clamped.
- `yusufOSEndpoints` gained a `basePath` option so the identical handler set is mounted at
  `/api/yusuf-os-ui` behind the session guard.

### The contract defect this gate found

The Gate F dashboard identifies every task, run, approval and intent by **uuid**, but the
pre-existing detail routes (`GET /tasks/:id`, `/runs/:id`, `/approvals/:id`) only accept the
internal **numeric** primary key. Nothing on the dashboard was actually openable. Fixed additively
with `/tasks/:id/detail`, `/runs/:id/detail`, `/approvals/:id/review` and a regression test that
walks dashboard → drilldown for a real delegated task. The numeric routes keep their exact Gate F
behaviour.

### Independent review findings (found after the implementation looked finished)

1. **Translated sentences assembled from fragments.** `t("... {{time}}")` was rendered next to a
   separate `<Timestamp>` element in three places. English produced a dangling clause; Arabic put
   the time in the wrong position entirely. Fixed with `formatDateTime()` interpolated *into* the
   sentence.
2. **A button caption used as a field label.** System Health labelled the "verified through
   sequence" value with the *Verify audit chain* button string.
3. **An empty approval backlog rendered as `CONSUMED`.** Reusing the approval lifecycle
   vocabulary made a real security state mean something it does not. Now "nothing pending".
4. **The System Health nav icon was an undo arrow** — semantically wrong and direction-sensitive.
5. **The drawer's close control was labelled "Clear selection"** instead of Close.
6. **Agent detail did not re-read on stream events**, so an open panel could go stale.

All six fixed. Two suspicions were checked in the real browser and cleared rather than assumed:
Tailwind does emit the `rtl:` variant this build relies on
(`.rtl\:rotate-180:where([dir="rtl"], ...)`), and every status text token passes WCAG AA against
the panel surface (lowest 4.79:1).

### Evidence

- Server: **51 suites / 559 tests** (was 50/546 — +1 suite, +13 tests). Zero Gate C–F regression.
- Frontend: **5 suites / 77 tests**, a new baseline (Gate A found none).
- Frontend lint clean, frontend build clean, server lint clean, `git diff --check` clean.
- Live: server boots with both mounts, gateway locked by default (`/dashboard` → 401 with
  `locked: true`), `/os` renders through the real Vite proxy with zero console errors, `/`
  verified intact and free of Yusuf OS styling or direction leakage.

### What was NOT proven

Unlocked Command Center surfaces were not visually validated live: reaching them requires typing
the control token into a browser field, which this agent does not do. Screenshots and viewport
emulation were also unavailable (the browser pane could not composite frames). See
`KNOWN_RISKS.md`.


## Gate A — Repository Discovery [REPORTED_NOT_REVERIFIED]

Status: Complete (prior to this branch's visible history in `docs/`/`.engineering-intelligence/`).
Findings (per handoff/README context): AnythingLLM provides reusable runtime (LLM provider
abstraction, Model Router, AIbitat, RAG, MCP, Agent Flows, imported skills, Scheduled Jobs,
chat runtime, frontend) but has multiple side-effect paths with no single policy boundary —
AIbitat invoking tool handlers directly, MCP tools executing directly, Agent Flow API calls
mutating directly, Scheduled Jobs auto-approving, imported Node skills running arbitrary JS
in-process, transient (non-durable) WebSocket approval. This finding is corroborated by the
Gate C diff: `server/jobs/run-scheduled-job.js` did in fact contain
`requestToolApproval = async () => ({ approved: true, message: "Auto-approved..." })` before
this branch's changes (see `git diff` on that file, or `GATE_HISTORY.md` Gate C section below).

## Gate B — Architecture & Contracts [DOCUMENTED_DECISION]

Status: Complete. Verdict: **GO_GATE_C** (`docs/yusuf-os/gate-b/gate-b-verdict.md`).
Deliverables: architecture/bounded-contexts, domain contracts (Principal, Agent, Capability,
Policy, Intent, ExecutionPlan, Approval, Receipt, Task/Run, Adapter, Verification), state
machines + SQLite persistence/idempotency/recovery design, adapter governance (browser session,
LocalGit, CLI, MCP, imported skills, Agent Flows, SQL, scheduler), repo-grounded threat model,
acceptance-test design, exact Gate C/D implementation plans, 10 consolidated ADRs. Documentation
only — no runtime code, schema, migration, frontend, or remote topology changed in Gate B itself.
Full package: `docs/yusuf-os/gate-b/`.

Residual blockers Gate B flagged before Gate C could start: (1) Yusuf must authorize the Git
remote topology change (fork=origin, upstream push disabled) — **done**, confirmed live in this
session (`git remote -v` shows `upstream push: DISABLED`). (2) Gate C must choose a concrete
fail-closed local session transport/CSRF mechanism — resolved as localhost-check +
bearer-token (`controlPlaneGuard.js`). (3) Validate SQLite/Prisma migration behavior — done,
see Gate C evidence below.

## Gate C — Yusuf Core [VERIFIED_FROM_REPOSITORY + VERIFIED_BY_TEST, 2026-08-17]

Status: **Complete and independently re-verified this session** (not just trusted from the
engineering-intelligence record). Implements the deterministic security/control-plane kernel:
Runtime → Canonicalizer → Policy → Approval → Execution Coordinator → Verification → Receipt →
Audit, plus the mandatory runtime interception into AIbitat/scheduled jobs/imported plugins, plus
a localhost-only authenticated `/api/yusuf-os/*` control-plane API.

What was independently re-checked this session (not just read as claims):
- Read the actual source for capability registry, PolicyEngine, YusufActionBoundary, ApprovalService,
  ExecutionCoordinator, AuditService, IntentCanonicalizer/IntentService, controlPlaneGuard,
  SecuritySettings, redaction, principals, constants, and the `/api/yusuf-os` endpoint file —
  confirmed each invariant in `ARCHITECTURE_INVARIANTS.md` against the actual code, not the docs.
- Read the full diff of every modified upstream file (`server/index.js`,
  `server/utils/agents/aibitat/index.js`, `defaults.js`, `ephemeral.js`, `imported.js`,
  `server/utils/MCP/index.js`, `server/utils/agentFlows/index.js`,
  `server/jobs/run-scheduled-job.js`, `server/models/scheduledJob.js`,
  `server/endpoints/scheduledJobs.js`) — confirmed the scheduled-job auto-approval bug is
  actually fixed (previously `requestToolApproval` unconditionally resolved `approved: true`;
  now denies by default and additionally excludes ungoverned extensions from unattended runs).
- Ran the tests myself: `npx jest server/__tests__/yusufOS <affected upstream suites>` → **13
  suites / 100 tests passed**, matching the recorded baseline exactly. Ran the full repo suite:
  `npx jest server` → **42 suites / 392 tests passed**, matching the recorded baseline exactly.
  Ran `npx eslint .` in `server/` → clean, no output. Ran `git diff --check` → exit 0.
- Read `server/__tests__/yusufOS/integration/securityCore.test.js` and
  `unit/runtimeBoundary.test.js` in full — confirmed the adversarial coverage claimed in the
  engineering-intelligence record is real: FORBIDDEN never approvable, double-decision race has
  exactly one winner, kill switch blocks an already-approved L3 without consuming it, audit
  verifier catches mutation/sequence-gap/previous-hash-rewrite/checkpoint-mismatch/tail-deletion/
  signature-forgery, secrets redacted before receipt persistence, `FAILED_UNKNOWN` vs `FAILED`
  distinction, reconciliation contention.

Answers to the mandatory Gate C verification questions (see `ARCHITECTURE_INVARIANTS.md` for the
code-level evidence behind each):

| Question | Answer |
|---|---|
| Is Policy really authoritative? | Yes |
| Can risk be supplied by caller? | No — rejected at canonicalization |
| Can FORBIDDEN create an ApprovalRequest? | No |
| Can an approved payload mutate before execute? | No — invalidates on any drift |
| Is idempotency server-owned? | Yes — DB-unique `intentFingerprint`, server `executionKey` |
| Can a direct governed handler execute? | No — always throws |
| Can a scheduled Yusuf mutation auto-approve? | No — fixed this Gate; verified in diff + tests |
| Can secret output reach the DB? | No — rejected at intake, redacted again at persistence |
| Does the audit chain verify tampering? | Yes — extensively tested |
| Can missing Yusuf auth fail open? | No — 503 if unconfigured, 401 if wrong, localhost+no-forwarded-headers required |
| Can external mutation occur without a receipt? | No — receipt is created before adapter.execute is ever called |

No P0 or P1 findings from this independent re-verification. Verdict: **READY_FOR_GATE_D**
(see `CURRENT_GATE.md`).

## Gate D — Governed LocalGit Execution Vertical Slice [VERIFIED_FROM_REPOSITORY + VERIFIED_BY_TEST, 2026-08-17]

Status: **Complete.** Authorized explicitly by Yusuf ("START GATE D") after the onboarding pass.
Implements the first real governed execution adapter (LocalGit) end to end: `git.read_status`,
`git.read_diff`, `git.read_log`, `git.read_show` (L0), `git.create_branch`, `git.switch_branch`,
`git.stage_paths`, `git.commit_local` (L2), `git.push_feature_branch` (L3). The `GATE_D_DEFERRED`
hard flag was removed from the capability registry for these keys; protected-branch direct/force
push route to the pre-existing `HARD_FORBIDDEN` capabilities (`protected_branch.direct_push`/
`.force_push`), proven `FORBIDDEN` directly at the Policy layer (zero execution, no approval,
audited), not merely refused by adapter-side convention.

**Files added:** `server/domain/yusufOS/adapters/localGit/{pathPolicy,branchPolicy,
remoteIdentity,gitProcess,repositoryIdentity,shapes,snapshot,requestBuilders,LocalGitAdapter}.js`,
`server/models/yusufOS/gitRepository.js`, `server/prisma/migrations/
20260817120000_add_yusuf_os_git_repositories/`, `server/__testUtils__/yusufOS/
gitRepositoryFixture.js` (disposable working-repo + local bare-remote fixture), and 6 new test
files under `server/__tests__/yusufOS/{integration,security}/`.

**Files modified:** `server/domain/yusufOS/capabilities/registry.js` (git.* capabilities
enabled), `server/prisma/schema.prisma` (additive `yusuf_git_repositories` model),
`server/__testUtils__/yusufOS/testDatabase.js` (added the new table to `clearYusufTables`). The
Gate C kernel itself — `runtime/YusufActionBoundary.js`, `policy/PolicyEngine.js`,
`approvals/ApprovalService.js`, `execution/ExecutionCoordinator.js`, `audit/AuditService.js` —
was **not modified**; Gate D proves those contracts are sufficient for a real adapter rather than
extending them.

**Architecture decision — protected-branch enforcement without touching the Action Boundary:**
`YusufActionBoundary.bindTool` fixes one capability per bound tool at bind time, so a single push
tool cannot dynamically switch to `protected_branch.direct_push` mid-request without modifying
that file. Rather than touch Gate C's most security-sensitive file, Gate D enforces protection at
two independent layers instead: (1) the request builder refuses to even construct a
`git.push_feature_branch` intent when either the source branch or the destination `remoteBranch`
is protected; (2) `protected_branch.direct_push`/`.force_push` are proven `FORBIDDEN` by Policy
directly in the test suite (mirroring Gate C's own `credential.extract` FORBIDDEN test), so the
guarantee holds even if a future caller reaches Policy some other way. See `KNOWN_RISKS.md`.

**Independent security review:** ran the `security-review` skill's sub-agent methodology
(vulnerability identification against the new LocalGit files only, everything else in scope
already reviewed) against the diff. Found and fixed before this session ended:
- **High** — `git.stage_paths` accepted a directory pathspec (including `"."`) which Git expands
  recursively, letting a caller stage every file in a directory — including a nested `.env` —
  without that file's own name ever being checked against the protected-basename list. Fixed:
  `resolveWithinRoot` now rejects any path that resolves to an existing directory.
- **High** — `buildPushFeatureBranchRequest` checked the local source `branch` against the
  protected-branches list but never checked the *destination* `remoteBranch` — the field that
  actually determines what gets overwritten on the remote. A caller could push an unprotected
  local branch straight onto the remote's `main`. Fixed: both `branch` and `remoteBranch` are now
  checked.
- **Medium** — `buildSwitchBranchRequest` was the only local-write builder that didn't check
  `isProtectedBranch` on its target, an inconsistency with no immediate exploit (checked-out
  branch is re-derived and re-checked by the stage/commit builders) but a regression risk. Fixed
  for consistency.
- **Low** — the protected-basename filter matched the literal caller-supplied string, which
  Win32's silent trailing-dot/space stripping could bypass (`.env.` resolves to the same file as
  `.env` on Windows). Fixed: basenames are normalized before matching.
All four fixes have dedicated regression tests; the full suite (below) includes them.

**Tests:** 6 new suites — `localGitPathEscape` (path/branch/revision/remote unit tests, including
the 4 regression tests above), `localGitProcessHardening` (env-isolation and external-diff/
textconv adversarial tests), `localGitAdapter` (full read/local-write lifecycle through the real
Action Boundary), `localGitPushLifecycle` (zero-execution-before-approval, exact-ref push +
independent `ls-remote` verification, SHA/remote-drift invalidation, idempotency, `FAILED_UNKNOWN`
+ reconciliation against the real bare remote, kill switch, protected-branch `FORBIDDEN` proof),
`localGitSecretRedaction` (secret-shaped committed content redacted in the persisted receipt,
embedded-credential remote rejected, shell-metacharacter commit message proven inert). Full
server regression: **47 suites / 467 tests**, all passing; lint clean; `git diff --check` clean;
`prisma migrate diff` from migrations to schema empty.

**Not built in Gate D (deliberately):** no real agent calls these capabilities yet (no
`bindTool` wiring into a live AIbitat agent) — that is Gate E. No real GitHub/network push. No
raw shell, `git.exec`, force-push, or arbitrary command capability. See `DEFERRED_WORK.md`.

Verdict: **GO_GATE_E** — see `CURRENT_GATE.md`.

## Gate E — First Governed AI Staff Runtime [VERIFIED_BY_TEST, 2026-08-17]

Status: **Complete.** Builds the first real multi-agent runtime on top of the Gate C kernel and
Gate D adapter, without weakening either (zero lines changed in `runtime/`, `policy/`,
`approvals/`, `execution/ExecutionCoordinator.js`, `audit/`).

**Architecture (deliberately decomposed — no "god service", no "god agent"):**
`agents/definitions.js` (code-owned roles) · `agents/AgentRegistry.js` (seeding + grant
isolation) · `agents/contracts.js` (structured output validation) · `agents/ModelClient.js`
(provider-agnostic + deterministic test client) · `agents/AgentRunCoordinator.js` (run lifecycle,
idempotency, concurrency, evidence) · `agents/toolBinding.js` (per-role governed toolsets) ·
`orchestration/ChiefOfStaff.js` (deterministic orchestration) ·
`orchestration/CompletionPolicy.js` (the gate) · `handoffs/HandoffService.js` ·
`review/ReviewService.js` (verdict authority) · `adapters/project/*` (file + typed command).

**Proven end-to-end (real, not simulated):** a disposable git-backed project with an
intentionally broken `add()` and a failing `node test/check.js`; Chief of Staff delegates →
Engineering reads/writes the file and runs validation *through the Action Boundary* → requests
review → Reviewer independently reads the diff and returns a verdict → the deterministic gate
completes the task. The file on disk genuinely changes.

**Also proven:** the BLOCK path (bad change caught, task cannot complete, rework creates a new
run, second review PASSes, prior BLOCK preserved in history); stale-review detection;
`PASS_WITH_WARNINGS`; L3 approval suspend/resume (Gate C parks the run at `WAITING_APPROVAL`
automatically and resumes it on consumption — orchestration does not have to re-wake it);
rejected approval producing a distinguishable blocker; a hostile README failing to change any
authoritative state or the audit chain; a Reviewer PASS failing to make a protected-branch push
legal; full audit continuity across the whole orchestration.

**Security review (self-conducted; the delegated review agent hit a session limit mid-run, so the
audit was completed directly against the six Gate E claims).** Three real issues found and fixed
with regression tests before completion:
1. **Prisma's SQLite table-redefine silently dropped Gate C's CHECK constraints** on
   `yusuf_tasks`/`yusuf_agent_runs` (status/priority/principal-type/version). Restored by hand in
   the migration and extended for the new enums; a regression test now asserts the constraints
   still bite after all migrations.
2. **Validation evidence was caller-asserted.** `recordEvidence` accepted `status: "PASSED"`,
   which the completion gate trusts as proof — the same self-certification class the gate exists
   to prevent. Now VALIDATION evidence requires an intent reference and derives PASSED/FAILED
   from the governed ActionReceipt.
3. **Evidence could be filed against a task its run didn't belong to**, letting evidence be
   injected into another task's gate. Now rejected.

Final: **P0 = 0, P1 = 0.** 49 suites / **521 tests** pass, lint clean, `git diff --check` clean,
Prisma valid with an empty `migrate diff`. Verdict: **GO_GATE_F**.

### Gate E — independent security review (post-commit, same session)

The in-gate review was self-conducted because the delegated review agent hit a session limit. A
**second, genuinely independent** review was then run against the committed code (`b8f61935`) and
found **three real issues the self-review missed** — two High. This is recorded honestly because
the original Gate E report claimed P0/P1 = 0, which was premature.

1. **[High] `project.write_file` + `project.run_command` composed into arbitrary code execution.**
   Engineering held both (L2/ALLOW each). The registered validation command necessarily executes a
   script *inside the project root* — exactly the region `write_file` may rewrite. Write the
   validation script, then run it, and you get arbitrary code execution as the server user: enough
   to read `server/.env` (which holds `YUSUF_OS_AUDIT_HMAC_KEY` and `YUSUF_OS_CONTROL_TOKEN`) and
   thereby forge the audit chain and reach the control plane. Allowlisting the *executable* does
   nothing about the content of the *script*.
   **Fixed:** registered commands must name the explicit script(s) they run (discovery forms such
   as `node --test` are refused at registration because their executed files can't be enumerated),
   and `project.write_file` now refuses any path a registered command executes.

2. **[High] No binding between a task's project and the repository an Agent targeted.**
   `repositoryId` is model-chosen; `resolveBoundRepository` only proved the binding existed, not
   that it belonged to *this* task's project. An Agent in a permissive project could read/write/
   run/commit/push in another project's repository — and `PolicyEngine` resolves project overrides
   from `task.projectId`, so the target project's restrictions were never consulted.
   **Fixed:** `assertRepositoryMatchesTask` in both the Project and LocalGit adapters. (The prior
   test only used a *random* uuid, which failed for the wrong reason and gave false confidence.)

3. **[Medium] The recorded `evidenceDigest` was never verified, and post-verdict governed
   mutations didn't block completion.** Staleness relied on self-reported IMPLEMENTATION evidence,
   so an Agent could do more governed work after a PASS and simply not record it.
   **Fixed:** the completion gate now recomputes and compares the evidence digest the verdict was
   bound to, *and* blocks on any execution receipt newer than the governing verdict (receipts are
   created by the Execution Coordinator, not by an Agent). Ordering uses monotonic ids/receipt
   completion rather than SQLite's one-second `CURRENT_TIMESTAMP`.

All three have regression tests. Post-fix: **49 suites / 525 tests**, lint clean, diff clean.
Verdict stands at **GO_GATE_F**, now with P0 = 0, P1 = 0 verified by an independent pass rather
than self-assessment.

**Lesson recorded for future gates:** self-review is materially weaker than independent review.
Do not report P0/P1 = 0 on the strength of a self-audit alone.

## Gate F — Command Center Backend Projections [VERIFIED_BY_TEST, 2026-08-17]

Status: **Complete.** Read-only projections only — **no UI was built** (that is Gate G; see
`FRONTEND_VISION.md`). Implements `docs/yusuf-os/gate-b/api-realtime-frontend.md` §4 and §5.

**What was built:**
- `projections/DashboardProjection.js` — the §4 `DashboardProjection` shape: `systemStatus`,
  `agentStatuses`, `taskStatuses`, `approvalAttentionQueue`, `activeHandoffs`, `runProgress`,
  `adapterHealth`, `auditSummary`, `costSummary`. Every value derives from persisted state; an
  unprovable value is reported as `0`/`null`/`UNCHECKED` rather than estimated.
- `projections/EventProjection.js` — the §5 `YusufEventEnvelope`, **derived from the existing
  audit chain** rather than a second event store. The chain already provides a single global
  monotonic `sequence`, durable retention, and write-time redaction, which is exactly what the
  realtime contract needs. Read-only: nothing in the projection can write, reorder, or delete an
  audit row.
- Routes (all behind the existing localhost + bearer-token guard): `GET /dashboard`,
  `GET /events?after=`, `GET /events/stream` (SSE with `Last-Event-ID` resume, reset frames,
  heartbeat), `POST /audit-integrity/check`.
- `CompletionPolicy` now reports `gates: {total, satisfied, failed}` so `runProgress` carries real
  gate counts instead of a fabricated percentage.

**Design decisions worth remembering:**
- Chain verification is a *command*, never part of a dashboard read — it walks every audit event,
  so a UI poll must not trigger it. Until it is run the honest answer is `UNCHECKED`.
- Adapter availability spawns a real `git --version`, so it is cached for 10s; a poll must not
  fork a process per request.
- Event `aggregateId` is translated from the audit chain's internal numeric task/run ids to public
  uuids. **This was caught by running the SSE stream live, not by unit tests** — the mapper looked
  correct in isolation, but the stream emitted ids no client could join against the dashboard.

**Independent security review** (run properly this time, per the Gate E lesson) found **six**
findings, all fixed with regression tests:
1. *[Medium]* A cached `VALID` audit verdict was paired with a **live** `lastSequence`, so a
   verification of sequence 10 kept describing a chain that had since grown — precisely the
   tampering window the hash chain exists to reveal. Now records `verifiedThroughSequence` and
   reports `STALE` when the chain has moved past it.
2. *[Medium]* `pendingReconciliation` counted only `UNKNOWN`, contradicting `CompletionPolicy`'s
   own definition and reporting a clean system after a crash between execution and verification.
   Now counts every non-terminal execution state.
3. *[Medium]* `activeHandoffs[].gate` emitted raw agent-authored free text into the operator's
   view and the event stream. Handoff reasons are now a controlled `UPPER_SNAKE_CASE` vocabulary
   at write time, and clamped/redacted on read.
4. *[Low]* SSE disconnect listeners were registered **after** the first `await`, so a client that
   aborted during the initial query leaked both timers permanently.
5. *[Low]* `setInterval(pump)` was non-reentrant: a slow pump could re-emit events and move the
   cursor backwards. Replaced with a self-scheduling loop and a monotonic cursor.
6. *[Low]* `controlPlane: HEALTHY` came from a `typeof` check that an empty or short audit key
   passes, while the audit subsystem itself requires ≥32 chars. Now uses the audit subsystem's own
   predicate.

**Verified clean by the reviewer:** read-only guarantee (no write reachable from any projection
path), guard coverage including SSE, deny-by-default metadata allowlist with no prototype-pollution
path, cursor/reset semantics (including the off-by-one at the retention boundary), identity
correlation, and SSE framing injection (`JSON.stringify` escaping plus a numeric-only `id:` line).

Final: **50 suites / 546 tests**, lint clean, diff clean. **P0 = 0, P1 = 0.** Verdict: **GO_GATE_G**.
