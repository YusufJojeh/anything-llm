# Test Baseline

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
→ **49 suites, 521 tests, 0 failed.** (Gate D baseline was 47/467; Gate E adds 2 suites and 54
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
