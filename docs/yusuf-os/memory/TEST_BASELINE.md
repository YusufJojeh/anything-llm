# Test Baseline

## CAVEMAN AUDIT continuation — 2026-09-06 [VERIFIED_BY_TEST]

- Full Yusuf OS backend, default parallel workers: `npx jest server/__tests__/yusufOS server` (from
  repo root) → **87 suites passed, 1 failed; 1072 passed, 2 failed, 1 skipped, 1075 total**. The one
  failure (`engineeringAgenticE2E.test.js`) showed the same signature as the prior session's
  documented flake: `ConnectorError("Timed out during query execution.")` on a `deleteMany` cleanup
  call, plus a Windows `EPERM` temp-dir cleanup race. Reran in isolation
  (`npx jest server/__tests__/yusufOS/integration/engineeringAgenticE2E.test.js --runInBand`) →
  **2/2 passed cleanly**. Confirmed `PARALLEL_WINDOWS_SQLITE_CONTENTION_FLAKE`, not a regression —
  same root cause as `KNOWN_RISKS.md` #20 (no `busy_timeout` on the shared SQLite connection),
  KEEP_DEFERRED reaffirmed this session (see `GATE_HISTORY.md`).
- Frontend: `cd frontend && npx vitest run --config vitest.config.js` → **17 suites, 202 tests, all
  passed** (was 14 suites/174 tests; +3 new suites/+28 tests this session — `listAndDetailPages.
  test.jsx`, `commandCenterAndApprovals.test.jsx`, `approvalReview.test.jsx`).
- Production build (`npm run build` in `frontend/`): clean. Same pre-existing >500kB chunk warnings
  (`CoreRingsWebGL`, `purify`, `index`), no new ones.
- `npx eslint` on the 4 files touched this session: 4 prettier formatting nits in the new test
  files, fixed with `--fix`; `ApprovalReview.jsx` itself was already clean. Re-ran the affected
  tests after the autofix — still 20/20 green.
- One real bug found and fixed: `ApprovalReview.jsx`'s realtime auto-refresh was silently disabled
  by a 3-argument call into a 2-argument hook (see `GATE_HISTORY.md` for detail). Regression test
  verified genuine via `git stash push -- <file>` → confirmed the test fails deterministically
  against the pre-fix code (times out waiting for a 2nd `approvalReview` call, not a false
  positive) → `git stash pop` to restore the fix.
- Independent cold review of the fix + all 3 new test files: **0 P0, 0 P1, verdict SAFE TO
  COMMIT**.
- Live browser pass (dev-only fixture harness, `frontend/yusuf-os-harness.html`, no control token
  needed) at 1440/768/390px and in Arabic/RTL: zero console errors, nav mirrors correctly, all
  icon-only controls carry real translated `aria-label`s, 3D constellation correctly gated below
  `lg` breakpoint with the accessible roster unaffected, agent detail drawer is a real
  `role="dialog"` with a labeled close button and closes on Escape, keyboard focus ring visible in
  both LTR and RTL. Not a substitute for Yusuf's own real-unlocked-session pass (see
  `HUMAN_ACTION_REQUIRED.md`) — this is fixture data through real components, not live system
  state.
- Local commits this session: fix + tests commit, and a separate docs-only stale-entry-correction
  commit (see `GATE_HISTORY.md` for hashes).

## CAVEMAN AUDIT continuation — 2026-09-05 [VERIFIED_BY_TEST]

- Full Yusuf OS backend, serial to avoid SQLite cross-file contention:
  `npx jest --runInBand server/__tests__/yusufOS` → **57 suites passed; 771
  passed, 1 skipped (optional live Ollama smoke), 0 failed**.
- The same suite run with Jest's default parallel workers showed 3 spurious
  failures (`agentReasoningLoop.test.js`, `careerAgenticE2E.test.js`,
  `engineeringAgenticE2E.test.js`), all sharing one signature:
  `ConnectorError("Timed out during query execution.")` or a Windows `EPERM`
  temp-dir cleanup race. Reran all three in isolation per the established
  flake protocol — all passed cleanly (24/24). Confirmed flake from SQLite
  single-connection contention under parallel file workers (see
  `KNOWN_RISKS.md` #20 for the underlying `busy_timeout` gap), not a
  regression from this session's changes.
- Frontend: `cd frontend && npx vitest run --config vitest.config.js` →
  **14 suites, 174 tests, all passed** (unchanged suite count; the 2
  notification-i18n tests added this session were already included).
  Pre-existing `act(...)` console warnings are unrelated noise, not failures.
- `npx prisma validate` (from `server/`): valid.
- `git diff --check`: clean.
- Targeted ESLint on the 15 files touched this session: one prettier
  formatting nit in `redaction.js`, fixed with `--fix`; otherwise clean.
- Six fixes landed this session, each with its own regression test — see
  `GATE_HISTORY.md` for the full list and commit hashes.
- Local commits: `2566344c`, `fbfd04b0`, `5a3102c6`, `022284ec`, `2c030aae`,
  `c2b8a909`, `cd9483c7`.

## Post-V1: Agent Workspace (Section 20) — 2026-09-04 [VERIFIED_BY_TEST]

- Frontend: `npx vitest run --config vitest.config.js` → **13 suites, 171 tests, all
  passed** (was 12 suites; +1 new suite `agentWorkspace.test.jsx`, +4 tests; the
  `commandCenterModel.test.js` suite gained 9 more cases for
  `deriveWorkspaceState`/`buildWorkspaceGroups`). Pre-existing `act(...)` console
  warnings from `AgentRoster`/`StatusChip` are unrelated noise, not failures.
- Targeted ESLint on the 7 changed files: clean after `--fix` (9 auto-fixable
  formatting nits, no logic issues).
- Production build (`npx vite build`): clean. Chunk-size warning is pre-existing
  and unrelated to this change.
- Live module-graph check (Vite dev server + Browser pane, `/os/agents`): every
  new/changed module (`Agents.jsx`, `commandCenterModel.js`, `AgentDetailPanel`,
  `VoiceConsole`, `primitives`, `statusSemantics`, `agentRoles`) loaded 200 OK
  with zero console/network errors; the governed session lock screen rendered
  correctly. **Not verified further** — going past the lock screen requires
  entering `YUSUF_OS_CONTROL_TOKEN`, which is a credential entry this agent will
  not perform; see `HUMAN_ACTION_REQUIRED.md`.
- No independent adversarial security review performed this session (frontend-
  only, no new backend endpoint or capability surface — every field rendered is
  sourced from already-reviewed `DetailProjections`/`RuntimeProjection`/
  `DashboardProjection` output).
- Local commit: `776102cc`.

## Phase AE final gate — 2026-08-24 [VERIFIED_BY_TEST]

- Initial full-server sweep found one real fixture regression:
  `commandCenterProjection.test.js` still used the removed Prisma
  `workerStatus` field. The fixture was repaired to use durable
  `workerLastFailureAt` / `workerLastErrorCode` values.
- Focused Command Center and Engineering/Career/Reasoning E2E commands then
  completed without a reported failure. The Windows fixture runner omitted its
  usual Jest aggregate summary; no pass count is inferred from that omission.
- Frontend Yusuf OS test command completed successfully; production build,
  Prisma validate, targeted server ESLint, and `git diff --check` passed.
- Final independent release review: **P0=0/P1=0**, PASS. Aggregate Jest count
  remains deliberately unrecorded because the Windows fixture runner omitted it.

## Phase X baseline — 2026-08-24 [VERIFIED_BY_TEST]

- Browser/security/prompt focused regression: **5 suites passed; 101 passed, 0 failed**.
- Server lint and `git diff --check`: passed.
- Fresh independent review: **P0=0/P1=0/P2=0**, gate PASS.

## Phase W baseline — 2026-08-22 [VERIFIED_BY_TEST]

- Full Yusuf OS: `npx jest --runInBand __tests__/yusufOS` → **55 suites passed; 730 passed,
  one optional live Ollama smoke skipped, 0 failed**.
- Final focused Career/Browser regression: **3 suites, 26 passed, 0 failed**; fixture alone passed.
- Server lint and `git diff --check`: passed.
- Fresh independent review: **P0=0/P1=0/P2=2**, gate PASS.

## Phase V baseline — 2026-08-22 [VERIFIED_BY_TEST]

- Yusuf OS baseline excluding the unfinished Phase W fixture:
  `npx jest --runInBand __tests__/yusufOS --testPathIgnorePatterns=careerAgenticE2E` →
  **54 suites passed; 729 passed, one optional live Ollama smoke skipped, 0 failed**.
- Phase V fixture: `engineeringAgenticE2E.test.js` → **2 passed** (the optional live Ollama
  Agent-loop smoke skipped because no local daemon/model was reachable).
- Server lint and `git diff --check`: passed.
- Fresh independent review: **P0=0/P1=0/P2=1**, gate PASS.

## Phase U baseline — 2026-08-21 [VERIFIED_BY_TEST]

- Full server: `npx jest --runInBand` → **84 suites passed; 1,030 passed, one optional live
  Ollama smoke skipped, 0 failed**.
- Frontend: `npx vitest run --config vitest.config.js` → **10 suites, 139 passed, 0 failed**.
- Focused voice backend: **3 suites, 22 passed**; focused voice frontend: **6 passed**.
- Server and frontend lint, frontend production build, and `git diff --check`: passed.
- Fresh independent review: **P0=0/P1=0/P2=2**, gate PASS.

## Phase T baseline — 2026-08-21 [VERIFIED_BY_TEST]

- Full Yusuf OS backend: `npx jest --runInBand __tests__/yusufOS` → **51 suites passed;
  712 passed, one optional live Ollama smoke skipped, 0 failed**.
- Fresh independent review focused run: **11 suites; 228 passed, one optional skip, 0 failed**.
- Prisma schema validation and additive migration-safety suite passed.
- Targeted Yusuf OS domain ESLint and `git diff --check` passed.
- Live Ollama/OpenAI behavior remains environment-unvalidated; mocked provider attack matrices pass.

## Phase S baseline — 2026-08-21 [VERIFIED_BY_TEST]

- Full server: `npx jest server --maxWorkers=2` → **77 suites, 969 tests** (968 passed, one
  Ollama live smoke skipped because no daemon was reachable).
- Yusuf OS server: `npx jest server/__tests__/yusufOS --maxWorkers=2` → **46 suites, 666 tests**
  (665 passed, the same one live smoke skipped).
- Frontend Yusuf OS: `npx vitest run --config vitest.config.js` → **9 suites, 133 tests passed**.
- Frontend production build: passed.
- Targeted changed-file server/frontend ESLint: passed. Full server lint still has unrelated,
  pre-existing Prettier failures in committed Career/Inbox files; Phase S files are clean.
- `git diff --check`: passed.

## Phase R (Model runtime / ModelRouter) [VERIFIED_BY_TEST — 2026-08-21]

```bash
YUSUF_OS_AUDIT_HMAC_KEY="<32+ char test value>" YUSUF_OS_CONTROL_TOKEN="<32+ char test value>" \
  npx jest server/__tests__/yusufOS server --maxWorkers=2
```
→ **76 suites, 956 tests, 0 failed, 1 skipped** (was 70 / 913 — this phase adds a new domain,
`server/domain/yusufOS/models/`).

New tests (`server/__tests__/yusufOS/modelRouting/`, `.../integration/executionPreClaimOrphan.test.js`):
- `ModelRouter.test.js` — LOCAL_ONLY never reaches OpenAI (even mid-call failure); zero/one/many
  Ollama models; generic gemma4 tag match present/missing; FALLBACK_CHAIN never retries an
  already-tried provider kind, and exhausts cleanly if both fail; OpenAI missing key falls through
  cleanly under OPENAI_FIRST; usage/cost fabrication resistance (router only echoes what
  `complete()` returned); provider/model spoofing resistance; malicious model output stays inert
  string data; unknown policy rejected.
- `OllamaProvider.test.js` — unreachable/timeout/zero-models/multi-model/malformed-`/api/tags`
  mocked cases; generic tag discovery; never issues pull/create/delete; KNOWN usage when eval
  counts present, UNAVAILABLE (never 0) when absent; cost always UNAVAILABLE; one live smoke test
  that skips gracefully if no daemon is reachable.
- `OpenAIProvider.test.js` — missing key/401/429/404/timeout/malformed-JSON; secret leakage
  assertions (the key value never appears in the returned envelope or a thrown error); provider/
  model spoofing resistance; KNOWN usage + ESTIMATED cost for a priced model, UNAVAILABLE cost for
  an unpriced one; malicious output stays inert; one live smoke test gated on `OPENAI_API_KEY`
  already being set (skipped in this environment).
- `RoutedModelClient.test.js` — every completion delegates to `ModelRouter`; Reviewer's
  `explicitProvider`/`explicitModel` config forces `EXPLICIT_MODEL` routing independent of
  Engineering's `FALLBACK_CHAIN` default.
- `recordModelCompletion.test.js` — persists the full routing envelope onto `yusuf_agent_runs`;
  `UNAVAILABLE` cost persists as `null`, never coerced to 0.
- `executionPreClaimOrphan.test.js` — Career and Inbox adapters, `availability()`/`preflight()`
  throwing before the claim transaction terminalizes to `FAILED` (never `FAILED_UNKNOWN`) with no
  orphaned intent and no receipt row created; the pre-existing post-claim `prepare()`-throws path
  is also locked in as a regression.

## Phase Q (Application submission seam) [VERIFIED_BY_TEST — 2026-08-20]

```bash
YUSUF_OS_AUDIT_HMAC_KEY="<32+ char test value>" YUSUF_OS_CONTROL_TOKEN="<32+ char test value>" \
  npx jest server --maxWorkers=2
```
→ **70 suites, 913 tests, 0 failed** (was 70 / 903 — this phase extends existing Career test
suites rather than adding a new domain suite).

Changed/added tests:
- `careerLifecycle.test.js` — 3 new cases: preparing an application stores a local draft without
  changing status; an application cannot be prepared once the opportunity has moved past
  `RESEARCHING`; empty `applicationNotes` is rejected before any write. One existing test
  corrected: "Career has no project, git, browser, or memory-write tool" -> "... and its only
  browser tool is browser.submit_form" (Career now legitimately holds it).
- `agentRuntimeSecurity.test.js` — added refusal rows for every other agent against
  `career.prepare_application`; removed the stale `[AGENT_KEYS.CAREER, "browser.submit_form"]`
  refusal row (now an intentional grant); updated the Career role-definition test to assert
  `browser.submit_form` and `career.prepare_application` are both present.
- `browserBrokerSecurity.test.js` — both "no Agent role may hold browser.submit_form" tests
  rewritten to assert Career is the sole exception (`isCapabilityAllowedForAgent` now returns
  `true` only for `[AGENT_KEYS.CAREER, "browser.submit_form"]`).
- `migrationSafety.test.js` — added the new migration name to the expected list.

New migration: `20260820190000_add_yusuf_os_career_application_notes` — additive nullable
`applicationNotes TEXT` column on `yusuf_career_opportunities`, no CHECK constraint (free text,
matching the existing `notes` column). **Naming pitfall caught during this phase:** the folder was
first named without the `_add_yusuf_os_` substring `testDatabase.js`'s harness matches to classify
Yusuf-owned vs. upstream migrations; in `applyGateCSeparately` mode this misordered it before any
Yusuf table existed. Renamed to include the substring; any future additive-column-only migration
must keep this naming convention regardless of what it's adding.

**Independent review found no P0/P1/P2.** Specifically verified digest consistency across every
`entryDigest`/`careerEntryDigest` call site (the highest-risk item — a shared digest formula
changed under two different adapters, `CareerAdapter.js` and Phase P's `InboxAdapter.js`);
confirmed `career.prepare_application` has no status argument anywhere in its request builder,
adapter execute case, or registry definition; confirmed `browser.submit_form`'s own code
(`BrowserAdapter.js`, `formRegistry.js`, `originPolicy.js`) is byte-for-byte unmodified by this
phase; confirmed capability isolation via the full refusal-table grep.

## Phase P (Sales/Inbox) [VERIFIED_BY_TEST — 2026-08-20]

```bash
YUSUF_OS_AUDIT_HMAC_KEY="<32+ char test value>" YUSUF_OS_CONTROL_TOKEN="<32+ char test value>" \
  npx jest server --maxWorkers=2
```
→ **70 suites, 903 tests, 0 failed** (was 68 / 859; adds 2 suites, 44 tests — includes the two
extra adversarial seam tests added after independent review's P1 fix, beyond the original count).

New files:
- `server/__tests__/yusufOS/integration/inboxLifecycle.test.js` — 13 tests through the real
  governed chain: record always starts at `NEW`/`null` classification; classify moves to `TRIAGED`
  and records the classification; the `TRIAGED->TRIAGED` self-loop reclassification succeeds;
  prepare_reply requires prior classification (rejects then succeeds); no send/reply/forward tool
  name exists in the Inbox toolset; archive_local is terminal; unknown message/linked-Career uuids
  are rejected before any write; the Career integration seam (Career Agent creates+advances an
  opportunity, Inbox Agent links it via classify_message, Inbox Agent itself advances it via
  `inbox.advance_linked_career_status`, asserting `career.record_opportunity` and the raw
  `career.update_status` are both absent from Inbox's toolset); **two adversarial seam tests added
  after independent review** — the seam capability has no argument to substitute a different
  opportunity uuid, and advancing a linked opportunity is refused unless the message's
  classification is INTERVIEW or REJECTION; reading by status/uuid.
- `server/__tests__/yusufOS/unit/inboxTransitions.test.js` — 8 tests of the pure `isValidTransition`
  logic, including a dedicated test separating the one self-loop (`TRIAGED->TRIAGED`) from true
  backward edges (none exist) — designed in from the start per the Founder-phase test-bug lesson.
- `organizationModel.test.js` updated: eight Departments now (was seven).
- `agentRuntimeSecurity.test.js` gained rows refusing other agents `inbox.*`, refusing Inbox any
  project/git/browser/memory-write/monitoring/marketing/founder/research capability, explicitly
  refusing Inbox both `career.record_opportunity` **and the raw `career.update_status`** (the
  post-review correction), and refusing Career/Reviewer/Engineering a grant of
  `inbox.advance_linked_career_status`, plus a direct role-definition assertion.
- `commandCenterGateway.test.js`/`commandCenterProjection.test.js` updated from 8 to 9 expected
  seeded agents (Inbox is now real and seeded by `ensureCoreStaff`).
- `migrationSafety.test.js` updated to expect the new migration in the applied-migrations list.

New migration: `20260820180000_add_yusuf_os_inbox` — additive `yusuf_inbox_messages` table (two
separate DB-level `CHECK` constraints: `status` and nullable `classification`).

**Independent review found one real P1, fixed before commit** — see `GATE_HISTORY.md` and
`CURRENT_GATE.md` for the full account. The original design granted Inbox the raw
`career.update_status` capability directly; review found the linkage-to-Career enforcement was
advisory (agent instruction only), not code-enforced. Fixed by replacing the grant with a new,
narrower `inbox.advance_linked_career_status` capability that takes an inbox message uuid (not an
opportunity uuid) and independently re-derives/re-checks linkage, classification, and transition
legality from fresh reads at both the request-builder and adapter-execute checkpoints. Everything
else reviewed held up clean: no real send/reply/forward/archive surface exists anywhere (confirmed
by grep); server-forced initial status/null classification; closed classification enum; TOCTOU
rechecks; redaction reuse confirmed applied to every persisted write; digest consistency;
structural capability isolation; migration/schema/constants alignment.

## Phase O (Research) [VERIFIED_BY_TEST — 2026-08-20]

```bash
YUSUF_OS_AUDIT_HMAC_KEY="<32+ char test value>" YUSUF_OS_CONTROL_TOKEN="<32+ char test value>" \
  npx jest server --maxWorkers=2
```
→ **68 suites, 859 tests, 0 failed** (was 66 / 825; adds 2 suites, 34 tests).

New files:
- `server/__tests__/yusufOS/integration/researchLifecycle.test.js` — 10 tests through the real
  governed chain: a new item always starts at `OPEN` even if the model asks for a different initial
  status; a valid forward transition (`OPEN -> INVESTIGATING`) succeeds and updates notes; the
  `ANSWERED -> INVESTIGATING` reopening edge succeeds; an illegal transition (`OPEN -> ANSWERED`) is
  rejected before any write and the row's digest is unchanged; a terminal item (`ABANDONED`) refuses
  any further transition; an unknown item uuid is rejected before any write; reading by status/uuid
  returns the right shape; Research's toolset has no project/git/browser/memory-write tool;
  re-recording the same question/category produces a second distinct row, not an upsert.
- `server/__tests__/yusufOS/unit/researchTransitions.test.js` — 8 tests of the pure
  `isValidTransition` logic: every legal edge (including the ANSWERED->INVESTIGATING reopening
  edge), the terminal state refuses every target, an out-of-enum target is never valid, an unknown
  source status is never valid, no source key is orphaned, and a dedicated test confirms
  `ANSWERED->INVESTIGATING` is the only backward/reopening edge.
- `organizationModel.test.js` updated: seven Departments now (was six).
- `agentRuntimeSecurity.test.js` gained rows refusing Reviewer/Engineering/Chief-of-Staff/
  Monitoring/Career/Marketing/Founder a grant of `research.*`, refusing Research a grant of any
  project/git/browser/memory-write/monitoring/career/marketing/founder capability, plus a direct
  role-definition assertion.
- `commandCenterGateway.test.js`/`commandCenterProjection.test.js` updated from 7 to 8 expected
  seeded agents (Research is now real and seeded by `ensureCoreStaff`).
- `migrationSafety.test.js` updated to expect the new migration in the applied-migrations list.

New migration: `20260820170000_add_yusuf_os_research` — additive `yusuf_research_items` table
(DB-level `CHECK` constraint on `status` matching the four-value transition-table enum).

**Independent review found no P0/P1/P2.** Confirmed: a model-supplied status on
`research.record_item` cannot override the server-forced `OPEN` start; the reopening edge
(`ANSWERED -> INVESTIGATING`) introduces no TOCTOU gap and no stale-digest acceptance; digest
recomputation is consistent across create/update/verify; capability isolation is structural, not
database-trusted; migration/schema/constants alignment is exact.

## Phase N (Founder) [VERIFIED_BY_TEST — 2026-08-20]

```bash
YUSUF_OS_AUDIT_HMAC_KEY="<32+ char test value>" YUSUF_OS_CONTROL_TOKEN="<32+ char test value>" \
  npx jest server
```
→ **66 suites, 825 tests, 0 failed** (was 64 / 792; adds 2 suites, 33 tests).

New files:
- `server/__tests__/yusufOS/integration/founderLifecycle.test.js` — 10 tests through the real
  governed chain: a new venture always starts at `IDEA` even if the model asks for a different
  initial status; a valid forward transition (`IDEA -> VALIDATING`) succeeds and updates notes;
  the `PAUSED -> BUILDING` resume edge succeeds; an illegal transition (`IDEA -> LAUNCHED`) is
  rejected before any write and the row's digest is unchanged; a terminal venture (`KILLED`)
  refuses any further transition; an unknown venture uuid is rejected before any write; reading by
  status/uuid returns the right shape; Founder's toolset has no project/git/browser/memory-write
  tool; re-recording the same name/category produces a second distinct row, not an upsert.
- `server/__tests__/yusufOS/unit/founderTransitions.test.js` — 9 tests of the pure
  `isValidTransition` logic: every legal edge (including branching to PAUSED/KILLED from three
  different states and the PAUSED->BUILDING resume), the terminal state refuses every target, an
  out-of-enum target is never valid, no source key is orphaned, and a dedicated test confirms
  `PAUSED->BUILDING` is the only edge that resumes progress toward the main pipeline.
- `organizationModel.test.js` updated: six Departments now (was five).
- `agentRuntimeSecurity.test.js` gained rows refusing Reviewer/Engineering/Chief-of-Staff/
  Monitoring/Career/Marketing a grant of `founder.*`, refusing Founder a grant of any project/git/
  browser/memory-write/monitoring/career/marketing capability, plus a direct role-definition
  assertion.
- `commandCenterGateway.test.js`/`commandCenterProjection.test.js` updated from 6 to 7 expected
  seeded agents (Founder is now real and seeded by `ensureCoreStaff`).
- `migrationSafety.test.js` updated to expect the new migration in the applied-migrations list.

New migration: `20260820160000_add_yusuf_os_founder` — additive `yusuf_founder_ventures` table
(DB-level `CHECK` constraint on `status` matching the six-value transition-table enum).

**Independent review found no P0/P1/P2.** Confirmed: a model-supplied status on
`founder.record_venture` cannot override the server-forced `IDEA` start; the branching transition
graph (three states can each reach PAUSED/KILLED, plus the one PAUSED->BUILDING resume edge)
introduces no TOCTOU gap and no path that reaches `LAUNCHED` without passing through `BUILDING` or
revives a `KILLED` venture; digest recomputation is consistent across create/update/verify;
capability isolation holds structurally; migration and `schema.prisma` match
`FOUNDER_VENTURE_STATUSES` exactly. See `GATE_HISTORY.md`.

## Phase M (Marketing) [VERIFIED_BY_TEST — 2026-08-20]

```bash
YUSUF_OS_AUDIT_HMAC_KEY="<32+ char test value>" YUSUF_OS_CONTROL_TOKEN="<32+ char test value>" \
  npx jest server
```
→ **64 suites, 792 tests, 0 failed** (was 62 / 760; adds 2 suites, 32 tests).

New files:
- `server/__tests__/yusufOS/integration/marketingLifecycle.test.js` — 11 tests through the real
  governed chain: a new content item always starts at `IDEA` even if the model asks for a
  different initial status; a valid forward transition (`IDEA -> DRAFTING`) succeeds and updates
  notes; the `READY_FOR_REVIEW -> DRAFTING` backward revision edge succeeds; the
  `SCHEDULED -> DRAFTING` backward pull-back edge succeeds; an illegal transition
  (`IDEA -> PUBLISHED`) is rejected before any write and the row's digest is unchanged; a terminal
  content item (`ARCHIVED`) refuses any further transition; an unknown content uuid is rejected
  before any write; reading by status/uuid returns the right shape; Marketing's toolset has no
  project/git/browser/memory-write tool; re-recording the same title/channel/format produces a
  second distinct row, not an upsert.
- `server/__tests__/yusufOS/unit/marketingTransitions.test.js` — 9 tests of the pure
  `isValidTransition` logic: every legal edge in the transition table (including both backward
  edges), the terminal state refuses every target, an out-of-enum target is never valid, no source
  key in the table is orphaned, and a dedicated test independently recomputes backward edges from
  table order and asserts the exact set is `{READY_FOR_REVIEW->DRAFTING, SCHEDULED->DRAFTING}`.
- `organizationModel.test.js` updated: five Departments now (was four).
- `agentRuntimeSecurity.test.js` gained rows refusing Reviewer/Engineering/Chief-of-Staff/
  Monitoring/Career a grant of `marketing.*`, refusing Marketing a grant of any project/git/
  browser/memory-write/monitoring/career capability, plus a direct role-definition assertion.
- `commandCenterGateway.test.js`/`commandCenterProjection.test.js` updated from 5 to 6 expected
  seeded agents (Marketing is now real and seeded by `ensureCoreStaff`).
- `migrationSafety.test.js` updated to expect the new migration in the applied-migrations list.

New migration: `20260820150000_add_yusuf_os_marketing` — additive `yusuf_marketing_content` table
(DB-level `CHECK` constraint on `status` matching the six-value transition-table enum).

**Independent review found no P0/P1/P2.** Confirmed: a model-supplied status on
`marketing.record_content` cannot override the server-forced `IDEA` start; the added backward-edge
transition surface (unlike Career, which is strictly forward-or-terminal) introduces no TOCTOU gap
or laundering path — every hop is independently re-validated against the current row at execute
time; digest recomputation is consistent across create/update/verify; capability isolation holds
structurally via the code-owned `allowedCapabilities` registry; migration and `schema.prisma` match
`MARKETING_CONTENT_STATUSES` exactly. See `GATE_HISTORY.md`.

**Note on this run's environment**: a full `npx jest server` at default parallelism showed 3
flaky failures (Windows SQLite connection timeouts / temp-dir cleanup EPERM under worker
contention) unrelated to Marketing — each failing suite was re-run individually and passed
cleanly. `npx jest server --maxWorkers=2` also passed clean at 64/792. Treat isolated-suite
re-runs as authoritative when default-parallelism runs show transient DB-connection timeouts on
Windows.

## Phase L (Career) [VERIFIED_BY_TEST — 2026-08-20]

```bash
YUSUF_OS_AUDIT_HMAC_KEY="<32+ char test value>" YUSUF_OS_CONTROL_TOKEN="<32+ char test value>" \
  npx jest server
```
→ **62 suites, 760 tests, 0 failed** (was 60 / 734; adds 2 suites, 26 tests).

New files:
- `server/__tests__/yusufOS/integration/careerLifecycle.test.js` — 8 tests through the real
  governed chain: a new opportunity always starts at `RESEARCHING` even if the model asks for a
  different initial status; a valid transition (`RESEARCHING -> APPLIED`) succeeds and updates
  notes; an illegal transition (`RESEARCHING -> OFFER`) is rejected before any write and the row's
  digest is unchanged; a terminal opportunity (`REJECTED`) refuses any further transition; an
  unknown opportunity uuid is rejected before any write; reading by status/uuid returns the right
  shape; Career's toolset has no project/git/browser/memory-write tool; re-recording the same
  company/role produces a second distinct row, not an upsert.
- `server/__tests__/yusufOS/unit/careerTransitions.test.js` — 7 tests of the pure
  `isValidTransition` logic: every legal edge in the transition table, both terminal states refuse
  every target, an out-of-enum target is never valid, and no source key in the table is orphaned.
- `organizationModel.test.js` updated: four Departments now (was three).
- `agentRuntimeSecurity.test.js` gained rows refusing Reviewer/Engineering/Chief-of-Staff/
  Monitoring a grant of `career.*`, refusing Career a grant of any project/git/browser/
  memory-write/monitoring capability, plus a direct role-definition assertion.
- `commandCenterGateway.test.js`/`commandCenterProjection.test.js` updated from 4 to 5 expected
  seeded agents (Career is now real and seeded by `ensureCoreStaff`).
- `migrationSafety.test.js` updated to expect the new migration in the applied-migrations list.

New migration: `20260820140000_add_yusuf_os_career` — additive `yusuf_career_opportunities` table
(DB-level `CHECK` constraint on `status` matching the six-value transition-table enum).

**Independent review found no P0/P1** (a first among the last several phases — every prior one had
at least one real P1). Confirmed: a model-supplied status on `career.record_opportunity` cannot
override the server-forced `RESEARCHING` start; the transition check is genuinely re-validated
against a fresh read in `CareerAdapter.execute()`, not just the request builder's earlier check
(no TOCTOU gap); digest recomputation is consistent across create/update/verify; capability
isolation holds structurally via the code-owned `allowedCapabilities` registry, not the database;
migration and `schema.prisma` match `CAREER_OPPORTUNITY_STATUSES` exactly. One P2/documentation
nit (notes cannot be cleared via `update_status`, only replaced — intentional, now commented) was
folded in as a one-line code comment. See `GATE_HISTORY.md`.

## Phase K (Monitoring) [VERIFIED_BY_TEST — 2026-08-20]

```bash
YUSUF_OS_AUDIT_HMAC_KEY="<32+ char test value>" YUSUF_OS_CONTROL_TOKEN="<32+ char test value>" \
  npx jest server
```
→ **60 suites, 734 tests, 0 failed** (was 58 / 705; adds 29).

New files:
- `server/__tests__/yusufOS/integration/monitoringLifecycle.test.js` — 8 tests through the real
  governed chain: Monitoring reads its own health snapshot; a clean system records an OK check; a
  model supplying a fake `status`/`observedValue` in its arguments is ignored (the server always
  recomputes the verdict); an unregistered `checkKey` is rejected before any row is written; a real
  manufactured unresolved-intent condition is recorded as WARN and Monitoring can then file a
  Knowledge finding about it; Monitoring's toolset has no project/git/browser/memory-write tool;
  two checks in a row produce two history rows (not an upsert); a stuck `monitoring.record_check`
  intent from a *prior* call is still counted as unresolved by a later check (the P1 fix, see
  `GATE_HISTORY.md`).
- `server/__tests__/yusufOS/unit/monitoringThresholds.test.js` — 11 tests of the pure
  `evaluateSystemHealth`/`evaluateCheck` logic: OK/WARN/BREACH boundaries for both signals, worst-
  of-multiple-signals-wins, a degraded control plane always BREACHes, an engaged kill switch is
  reported but does not itself escalate status, dispatch-by-checkKey, and JSON-serializability of
  the threshold output.
- `organizationModel.test.js` updated: three Departments now (was two); exactly one Agent
  (Monitoring) is AUTONOMOUS; a new structural test asserts no AUTONOMOUS-level Agent may hold a
  capability above risk L1 or of operationClass EXTERNAL_MUTATION, looked up from the capability
  registry for every `AgentDefinition`.
- `agentRuntimeSecurity.test.js` gained rows refusing Reviewer/Engineering/Chief-of-Staff a grant
  of `monitoring.record_check`, and refusing Monitoring a grant of any project/git/browser/
  memory.write capability, plus a direct role-definition assertion.
- `commandCenterGateway.test.js`/`commandCenterProjection.test.js` updated from 3 to 4 expected
  seeded agents (Monitoring is now real and seeded by `ensureCoreStaff`).
- `migrationSafety.test.js` updated to expect the new migration in the applied-migrations list.

New migration: `20260820120000_add_yusuf_os_monitoring` — additive `yusuf_monitoring_checks` table
(append-only check history; DB-level `CHECK` constraint on `status`).

**Independent review caught one real bug before commit**: the health snapshot excluded the whole
`monitoring.record_check` capability from its own unresolved-intent count to avoid a
self-observation paradox (a check's own intent is still `EXECUTING` while it reads the snapshot) —
but `monitoring.record_check` is a real write that can legitimately get stuck
`EXECUTING`/`FAILED_UNKNOWN`, and a capability-wide exclusion would have hidden that forever, not
just the in-flight call. Fixed to exclude only the exact in-flight intent id. See `GATE_HISTORY.md`.

## Phase J (Knowledge/Evidence/Memory split) [VERIFIED_BY_TEST — 2026-08-20]

```bash
YUSUF_OS_AUDIT_HMAC_KEY="<32+ char test value>" YUSUF_OS_CONTROL_TOKEN="<32+ char test value>" \
  npx jest server
```
→ **58 suites, 705 tests, 0 failed** (was 56 / 666; adds 39).

New files:
- `server/__tests__/yusufOS/integration/knowledgeMemoryLifecycle.test.js` — 24 tests through the
  real Intent -> Policy -> Execution -> Verify chain: Engineering writes Knowledge, Reviewer reads
  it back; Reviewer has no `knowledge.write` tool; two writes with identical content produce two
  distinct entries (never silently merged); tag-based Knowledge read; PROJECT/AGENT/TASK-scoped
  Memory write+read succeeding for the owning identity and refused for a mismatched one; PERSONAL
  scope refused for an Agent principal even though `memory.write` is granted; same-key Memory
  writes upsert instead of duplicating; `recordEvidence` refuses `SECRET_FORBIDDEN` outright;
  retention-derived `expiresAt`; `tombstoneExpiredEvidence` truncates content while preserving
  digest/classification and writes exactly one audit event; a failed audit append inside the
  tombstone transaction leaves the row completely untouched (the P1 fix below); not-yet-expired
  evidence is left alone.
- `server/__tests__/yusufOS/unit/knowledgeMemoryValidation.test.js` — 15 tests: Knowledge/Memory
  request-builder validation (missing/oversized fields, unknown enum values, too many tags), the
  server always minting a fresh Knowledge uuid, `assertScopeOwnership`'s pure logic for every
  Memory scope against a stub db, and `EVIDENCE_RETENTION_DAYS` ordering sanity.
- `agentRuntimeSecurity.test.js` gained four `test.each` rows: Reviewer/Chief-of-Staff refused a
  grant of `knowledge.write`/`memory.write` (the existing generic loops already covered the
  toolset-level exclusion since both were added to `MUTATION_CAPABILITIES`).
- `migrationSafety.test.js` updated to expect the new migration in the applied-migrations list.

New migration: `20260818090000_add_yusuf_os_knowledge_evidence_memory` — additive `evidenceClass`/
`expiresAt`/`tombstonedAt` columns on `yusuf_run_evidence`, plus `yusuf_knowledge_entries` and
`yusuf_memory_entries`.

**Independent review caught one real bug before commit**: `tombstoneExpiredEvidence` truncated a
row and appended its audit event as two separate calls — a failure in the audit step could destroy
evidence content with no audit record, the exact silent-forgetting failure ADR-008 exists to
prevent. Fixed by wrapping both in one `db.$transaction`; a failed row is now left fully untouched
(still eligible for the next run) rather than half-truncated. See `GATE_HISTORY.md`.

## Organization model (Department/AutonomyLevel) [VERIFIED_BY_TEST — 2026-08-20]

```bash
YUSUF_OS_AUDIT_HMAC_KEY="<32+ char test value>" YUSUF_OS_CONTROL_TOKEN="<32+ char test value>" \
  npx jest server
```
→ **56 suites, 666 tests, 0 failed** (was 55 / 652; adds 14).

New file: `server/__tests__/yusufOS/unit/organizationModel.test.js` — every AgentDefinition
resolves to exactly one real Department and vice versa, no empty/orphaned Department, every
AgentDefinition declares a recognized AutonomyLevel with none `AUTONOMOUS` yet, and a
`test.each` block that greps `PolicyEngine.js`/`ApprovalService.js`/`registry.js`/
`IntentService.js`/`ExecutionCoordinator.js` source text for any reference to the organization
module, `autonomyLevel`, or `departmentKey` and fails if one appears.

No new DB migration, no frontend change this phase.


## Phase I (governed browser mutations) [VERIFIED_BY_TEST — 2026-08-20]

```bash
YUSUF_OS_AUDIT_HMAC_KEY="<32+ char test value>" YUSUF_OS_CONTROL_TOKEN="<32+ char test value>" \
  npx jest server
```
→ **55 suites, 652 tests, 0 failed** (was 53 / 607; Phase I adds 45).

New files:
- `server/__tests__/yusufOS/integration/browserSubmitFormLifecycle.test.js` — 13 tests: waiting for
  approval before any driver call, an approved submission succeeding with independent
  re-verification, unregistered-form/unknown-field/missing-required-field rejection, unverified
  account rejection at build time, account-switch-after-approval invalidation, page-content-drift-
  after-approval invalidation, navigate-away-after-approval refusal, double-execution idempotency,
  an uncertain outcome resolving to `FAILED_UNKNOWN` then `reconcile` confirming success, a
  submission that never landed reconciling to a genuine `FAILED`/`NOT_APPLIED` rather than a
  fabricated success, the kill switch blocking without consuming the approval, and a disabled
  broker refusing to even build the request.
- `server/__tests__/yusufOS/unit/browserMutationGuards.test.js` — 28 tests: every `formRegistry.js`
  and `mutationGuards.js` pure-function edge case (unregistered/non-allowlisted forms, field
  allowlist/length/type/required violations, origin/path mismatch, unverified/mismatched/unbound
  account digests, page-drift detection, and the `effectCertain` failure-classification rules).
- `server/__tests__/yusufOS/security/browserBrokerSecurity.test.js` updated: the "every capability
  is read-only" test now explicitly carves out `browser.submit_form` as the one deliberate L3
  mutation, plus 3 new tests confirming it is reachable-but-not-yet-granted (mirroring Phase H).

**All Phase I tests run on the fixture driver** — no browser, no network, no account. The CDP
`submitForm` path is therefore *unproven in the field*, same caveat as Phase H's read path; see
`KNOWN_RISKS.md`. An independent review before commit caught two real bugs invisible to this
fixture suite (dropped field selectors, an unwired page-drift guard) — both fixed, and the fixture
driver itself was tightened afterward so the field-selector regression would now fail a test too.

Frontend unchanged this phase.


## Phase H (Browser Broker) [VERIFIED_BY_TEST — 2026-08-18]

```bash
YUSUF_OS_AUDIT_HMAC_KEY="<32+ char test value>" YUSUF_OS_CONTROL_TOKEN="<32+ char test value>" \
  npx jest server
```
→ **53 suites, 607 tests, 0 failed** (was 51 / 559; Phase H adds 45, plus one new Gate F assertion
for the broker appearing in adapter health).

New files:
- `server/__tests__/yusufOS/unit/browserOriginAndSanitizer.test.js` — 23 tests: exact-host
  allowlisting against lookalike/subdomain/scheme attacks, hidden-vs-visible text separation,
  injection-marker signalling, secret redaction, clamping, digest stability, and account identity
  that never carries a credential.
- `server/__tests__/yusufOS/security/browserBrokerSecurity.test.js` — 22 adversarial tests through
  the adapter, including TOCTOU tab navigation, disabled broker, empty allowlist, vanished tab,
  URL-token leakage, page-changed-between-reads, and the reachable-but-ungranted invariant.

**All Phase H tests run on the fixture driver** — no browser, no network, no account. The CDP
attachment path is therefore *unproven in the field*; see `KNOWN_RISKS.md`.

Frontend unchanged this phase: 7 suites / 129 tests.


## Gate G.1 visual polish [VERIFIED — 2026-08-18]

```bash
cd frontend && npx vitest run --config vitest.config.js
```
→ **6 suites, 109 tests, 0 failed** (was 5 / 78). New coverage: adaptive ring radii per roster
band, ring capacity derived from chord geometry, no-overlap and in-canvas invariants at 1/3/6/9/10/
16/24/40/48 agents, third-ring escalation, inter-ring angular offset, core-vs-node dominance ratio,
layout determinism, edge midpoint/angle, role glyph stability and colour-free role identity, and
`edgeKind` classification from the persisted handoff reason.

Live browser measurement (dev fixture harness, 10 scenarios x 4 viewports x 2 languages):

| Measure | Result |
|---|---|
| Core dominance | 135px → **170px** at 1440x900; core/node radius 2.53x → **3.18x** |
| Desktop viewport fit | page height exactly 900 at 1440x900 — no page scroll |
| Nav rail footprint | **152px → 57px** desktop; 44px targets and accessible names intact |
| 3-agent spacing | 599 → **306** units apart (deliberate formation, not empty) |
| Overlap / clipping | **0 / 0** at 1, 3, 6, 10, 24 agents and long names, EN and AR |
| Arabic RTL | rail right, drawer opens left, icons mirrored, no overflow, no page scroll |
| Reduced motion | 4 animated elements → ~0s; state and relationships still readable |
| Production build | harness absent from `dist/` (verified by file and content grep) |

**Not measured:** screenshots (the browser pane still cannot composite frames) and `:focus-visible`
under programmatic focus (Chrome only applies it to keyboard interaction — the CSS rule itself was
verified separately). Tablet at 1024x768 does scroll vertically; the fixed-height console layout
starts at the `xl` breakpoint by design.


## Live visual QA (Gate G closeout) [VERIFIED_IN_BROWSER — 2026-08-18]

Run against the dev-only fixture harness (`/yusuf-os-harness.html?scenario=…&lang=…&route=…`),
which mounts the real provider and real components over deterministic fixtures. **Not production
state**; the harness is excluded from `vite build` output (verified).

| Check | Result |
|---|---|
| Desktop 1440×900 | Fits viewport, no page scroll, no horizontal overflow, core centred |
| Tablet 1024×768 | Constellation retained, operational |
| Narrow tablet 768 | Constellation `display:none` (transformed, not shrunk), roster + attention intact |
| Mobile 390×844 | No horizontal overflow, all nav targets 44×44, all surfaces reachable |
| Constellation 0/1/3/6/10/24 + long names | 0 node overlaps, 0 clipped labels, 0 label collisions at every size |
| Arabic RTL | `dir=rtl`, rail moves to the right edge, drawer opens from the left, caret mirrored, no English leakage |
| Reduced motion | 2 animated elements neutralized to 1e-06s; state still readable |
| Approval lifecycle | All 6 states distinct; APPROVED renders blue "not yet executed", CONSUMED green |
| Approval review | Capability, L3 risk, target, digest, policy explanation, BLOCK verdict, single-use, no always-allow control; only "Approve once" / "Reject" |
| Audit states | UNCHECKED purple + "never been verified", STALE amber + "older chain tip", BROKEN red |
| Dialog a11y | Focus enters on open, Escape closes, focus returns to opener; `:focus-visible` = 2px solid outline |
| Tab order | rail → core → attention → roster |

**Screenshots: not captured.** The browser pane cannot composite frames in this environment, so
`computer{action:"screenshot"}` times out. Evidence above is geometric/DOM measurement instead. No
screenshot was fabricated.


## Last re-run (Gate G session, live) [VERIFIED_BY_TEST — 2026-08-18]

```bash
YUSUF_OS_AUDIT_HMAC_KEY="<32+ char test value>" YUSUF_OS_CONTROL_TOKEN="<32+ char test value>" \
  npx jest server
```
→ **51 suites, 559 tests, 0 failed.** (Gate F baseline was 50 / 546; Gate G adds
`server/__tests__/yusufOS/integration/commandCenterGateway.test.js`, 13 tests.)

**Frontend baseline — new in Gate G.** Gate A found no frontend test infrastructure at all.
Vitest was chosen over a second Jest setup because Vite is already the bundler, so it reuses the
same transform pipeline and the same `@` alias with no Babel config. Scoped to the Yusuf OS
feature only — the rest of the monorepo is not retroactively placed under a runner it never had.

```bash
cd frontend && npx vitest run --config vitest.config.js
```
→ **5 suites, 77 tests, 0 failed.** Covers projection mapping, edge filtering, core-state
precedence, attention ordering, SSE duplicate/out-of-order/gap/reset/schema/reconnect handling,
constellation layout for 0..24 agents, status semantics, agent status rendering, the full
approval lifecycle vocabulary, LOADING vs EMPTY vs unknown, dialog semantics/focus trap/focus
return, and Arabic + bidi isolation.

```bash
cd frontend && npx eslint src        # clean
cd frontend && npx vite build        # clean
cd server   && npx eslint .          # clean
git diff --check                     # exit 0
```

New devDependencies (frontend, dev-only): `vitest`, `jsdom`, `@testing-library/react`,
`@testing-library/user-event`, `@testing-library/jest-dom`. Installed with `yarn` — `npm install`
fails on a **pre-existing** peer conflict in this repo (`@lobehub/ui` wants React 19, the app is
on React 18), unrelated to Gate G.


## Last re-run (this session, live) [VERIFIED_BY_TEST — 2026-08-17, after Gate D]

Run from repo root (not `server/` — `server/package.json` has no jest script/devDependency; the
root `package.json` does):

```bash
YUSUF_OS_AUDIT_HMAC_KEY="<32+ char test value>" YUSUF_OS_CONTROL_TOKEN="<32+ char test value>" \
  npx jest server/__tests__/yusufOS
```
→ **16 suites, 164 tests, 0 failed.**

```bash
YUSUF_OS_AUDIT_HMAC_KEY="<32+ char test value>" YUSUF_OS_CONTROL_TOKEN="<32+ char test value>" \
  npx jest server
```
→ **47 suites, 467 tests, 0 failed.**

```bash
cd server && npx eslint .
```
→ clean, no output, exit 0.

```bash
git diff --check
```
→ exit 0.

```bash
cd server && npx prisma format && npx prisma validate && npx prisma migrate diff \
  --from-migrations ./prisma/migrations --to-schema-datamodel ./prisma/schema.prisma \
  --shadow-database-url "file:./storage/_shadow.db" --script
```
→ schema valid, migration diff empty (migration SQL matches schema exactly).

Growth from the Gate C baseline (13 suites/100 tests Yusuf-OS-only, 42 suites/392 tests full
server) is Gate D's 6 new test files: `localGitPathEscape`, `localGitProcessHardening`,
`localGitAdapter`, `localGitPushLifecycle`, `localGitSecretRedaction` (+1 suite counted
previously under a different name). All counts above were a live re-run this session, not a
re-statement of a record.

## Suite list (Yusuf OS)

`server/__tests__/yusufOS/unit/`: `stateTransitions`, `capabilities`, `redaction`,
`apiValidation`, `runtimeBoundary`, `controlPlaneGuard`, `canonicalJson`,
`scheduledApprovalPolicy`.
`server/__tests__/yusufOS/integration/`: `apiBoundary`, `migrationSafety`, `securityCore`,
`localGitAdapter`, `localGitPushLifecycle`.
`server/__tests__/yusufOS/security/`: `localGitPathEscape`, `localGitProcessHardening`,
`localGitSecretRedaction`.

## Notes for future runs

- Tests need `YUSUF_OS_AUDIT_HMAC_KEY` and `YUSUF_OS_CONTROL_TOKEN` set to *some* ≥32-char value
  in the environment (test-only, never a real secret) or the audit/control-plane code paths will
  throw by design.
- `server/__tests__/yusufOS/integration/*` and the LocalGit suites spin up a temporary SQLite
  database via `server/__testUtils__/yusufOS/testDatabase.js`, and the LocalGit suites also spin
  up a disposable working repo + local bare remote via
  `server/__testUtils__/yusufOS/gitRepositoryFixture.js` — expect "SQLite is an experimental
  feature" Node warnings and `git checkout`/`switch` stdout in test output; both are benign.
- Shared, non-test helper files (`testDatabase.js`, `gitRepositoryFixture.js`) must live under
  `server/__testUtils__/`, not `server/__tests__/` — Jest's default `testMatch` treats any `.js`
  file under a `__tests__` directory as a test suite regardless of filename, which is exactly
  what broke the first attempt at `server/__tests__/yusufOS/fixtures/gitRepositoryFixture.js`.
- If suite/test counts drop from 16/164 (Yusuf OS) or 47/467 (full server) without an intentional
  test change, treat it as a regression, not an expected fluctuation.

## Gate E update [VERIFIED_BY_TEST — 2026-08-17]

```bash
YUSUF_OS_AUDIT_HMAC_KEY="<32+ char test value>" YUSUF_OS_CONTROL_TOKEN="<32+ char test value>" \
  npx jest server
```
→ **49 suites, 525 tests, 0 failed.** (Gate D baseline was 47/467; Gate E adds 2 suites and 54
tests.) `npx eslint .` in `server/` clean; `git diff --check` exit 0; `prisma validate` valid with
an empty `migrate diff`.

New Gate E suites: `server/__tests__/yusufOS/security/agentRuntimeSecurity.test.js` (38 tests —
capability isolation, model-output authority rejection, reviewer spoofing, handoff forgery,
idempotency, concurrency, illegal transitions, evidence integrity) and
`server/__tests__/yusufOS/integration/agentOrchestration.test.js` (11 tests — full happy path,
BLOCK + rework, stale review, PASS_WITH_WARNINGS, approval suspend/resume, rejected approval,
prompt injection, FORBIDDEN-despite-PASS, projection shape, audit continuity, telemetry).

New fixture: `server/__testUtils__/yusufOS/agentFixture.js` (disposable git-backed project with a
deliberately failing check + the three seeded Agents). Requires no LLM key and no network.

## Gate F update [VERIFIED_BY_TEST — 2026-08-17]

→ **50 suites, 546 tests, 0 failed.** New suite:
`server/__tests__/yusufOS/integration/commandCenterProjection.test.js` (21 tests — dashboard shape
and honesty, auth on every projection route, kill-switch surfacing, adapter health, audit
UNCHECKED→VALID→STALE lifecycle, approval attention queue, event ordering/cursor/reset semantics,
metadata allowlist, uuid identity correlation, read-only guarantee).

Note: the SSE stream was additionally smoke-tested against a **live** server (real socket, real
frames) — that is how the uuid-correlation defect was found. Unit tests over the mapper alone did
not catch it.
