# Test Baseline

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
