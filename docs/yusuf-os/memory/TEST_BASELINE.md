# Test Baseline

## Last re-run (this session, live) [VERIFIED_BY_TEST — 2026-08-17]

Run from repo root (not `server/` — `server/package.json` has no jest script/devDependency; the
root `package.json` does):

```bash
YUSUF_OS_AUDIT_HMAC_KEY="<32+ char test value>" YUSUF_OS_CONTROL_TOKEN="<32+ char test value>" \
  npx jest server/__tests__/yusufOS server/__tests__/utils/agents/defaults.test.js server/__tests__/utils/agents/imported.test.js
```
→ **13 suites, 100 tests, 0 failed.**

```bash
YUSUF_OS_AUDIT_HMAC_KEY="<32+ char test value>" YUSUF_OS_CONTROL_TOKEN="<32+ char test value>" \
  npx jest server
```
→ **42 suites, 392 tests, 0 failed.**

```bash
cd server && npx eslint .
```
→ clean, no output, exit 0.

```bash
git diff --check
```
→ exit 0, no whitespace conflict markers.

Both counts match the Gate C engineering-intelligence record
(`.engineering-intelligence/gate-c.md`) exactly — this was a live re-run, not a re-statement of
that record.

## Suite list (Yusuf OS)

`server/__tests__/yusufOS/unit/`: `stateTransitions`, `capabilities`, `redaction`,
`apiValidation`, `runtimeBoundary`, `controlPlaneGuard`, `canonicalJson`,
`scheduledApprovalPolicy`.
`server/__tests__/yusufOS/integration/`: `apiBoundary`, `migrationSafety`, `securityCore`.

## Notes for future runs

- Tests need `YUSUF_OS_AUDIT_HMAC_KEY` and `YUSUF_OS_CONTROL_TOKEN` set to *some* ≥32-char value
  in the environment (test-only, never a real secret) or the audit/control-plane code paths will
  throw by design.
- `server/__tests__/yusufOS/integration/*` spin up a temporary SQLite database via
  `server/__testUtils__/yusufOS/testDatabase.js` — expect an "SQLite is an experimental feature"
  Node warning; this is benign.
- If suite/test counts drop from 13/100 or 42/392 without an intentional test change, treat it as
  a regression, not an expected fluctuation.
