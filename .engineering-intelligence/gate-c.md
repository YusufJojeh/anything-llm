# Yusuf OS Gate C Engineering Intelligence

## Objective

Implement and prove the deterministic Yusuf OS security/control-plane kernel only. Gate D adapters, browser automation, external integrations, agents, and frontend remain out of scope.

## Invariants

- Code-owned, versioned capability definitions and hard `FORBIDDEN` rules.
- Agents request actions; Policy alone assigns outcome and risk.
- One Action Boundary for every Yusuf-governed runtime invocation.
- Approval is durable, payload/version/resource-bound, optimistic, and one-use.
- Execution, verification, and receipt are distinct.
- Server owns execution/idempotency authority.
- `FAILED_UNKNOWN` blocks retry until reconciliation.
- Audit is dedicated, append-only through the service, hash-chained,
  HMAC-checkpointed with a required non-database key, and non-cascading.
- Yusuf mutation routes are localhost-only and fail-closed authenticated.
- SQLite transactions are short and never span external/model execution.

## Slices

1. C1 persistence and deterministic state.
2. C2 canonicalization, Policy, approvals, execution/verification, audit, redaction, kill switch.
3. C3 authenticated internal API, validation, request IDs, stable errors.
4. C4 mandatory runtime interception and scheduled/MCP/flow contracts.
5. C5 adversarial, migration, regression, lint, and review validation.

## Acceptance gate

- Direct governed handler bypass is blocked.
- L2 code-owned demo intent can be authorized through Policy.
- L3 has zero execution before approval and executes once after valid approval.
- Payload/intent/resource changes invalidate prior approval.
- `FORBIDDEN` produces a durable decision/audit event and never an approval.
- Kill switch blocks approved L3/L4.
- Audit alteration/deletion is detected.
- Raw secret material is rejected before intent persistence; only opaque
  `secretRef` handles are accepted, with output redaction as defense in depth.
- Mutation API fails closed without auth or locality.
- Scheduled Yusuf L3 waits durably and cannot use legacy auto-approval.

## Current baseline

- Branch: `feature/yusuf-os-core`.
- Baseline SHA: `3aec848f2885144aa8f1e53b9731a04310d5d558`.
- Origin: Yusuf fork.
- Upstream push URL: `DISABLED`.
- Gate B docs: 20 untracked files preserved.
- Database: Prisma 5.3.1 with SQLite.
- Dependencies initially absent; install only from existing server lockfile when validation requires it.

## Deferred

LocalGit, GitHub API, raw shell, browser bridge, MCP side effects, governed SQL implementation, Open Computer, external communication integrations, full agents, `/os` UI, and Git push/PR.

## Verification evidence (2026-08-17)

- `npx prisma format`, `validate`, and `generate`: passed on Prisma 5.3.1.
- `prisma migrate diff` from migrations to schema: empty migration.
- Exact ordered migration SQL applied to temporary SQLite only; live storage was untouched.
- `npm run lint:check`: passed.
- Yusuf OS plus affected runtime suites: 13 suites, 100 tests passed.
- Full server suite: 42 suites, 392 tests passed.
- Adversarial coverage includes forged tool metadata, unattended approval,
  L2/L3/FORBIDDEN, stale payload/resource/account, double decision,
  reconciliation contention, verifier uncertainty, audit mutation/gap/tail/full
  deletion (including events plus checkpoint), checkpoint rewriting, provider
  credential patterns in generic fields, localhost/token boundary, scheduled
  extension loading, code-owned scheduled-tool allowlisting (including raw SQL
  rejection), and migration constraints.
