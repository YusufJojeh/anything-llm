# Gate History

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
