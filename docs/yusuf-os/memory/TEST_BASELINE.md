# Test Baseline

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
