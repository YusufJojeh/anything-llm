# Architecture Invariants [VERIFIED_FROM_REPOSITORY unless marked]

```
Agents think.
Control Plane authorizes.
Execution Plane acts.
Verification proves.
Audit remembers.
```

Every claim below was independently re-derived by reading the Gate C source in
`server/domain/yusufOS/` on 2026-08-17, not just taken from documentation.

## The invariants, and where they're enforced

1. **One mandatory Action Boundary.** `server/domain/yusufOS/runtime/YusufActionBoundary.js`
   binds a tool's `handler` to always throw `POLICY_DENIED` — the real path is
   `dispatch()` → `IntentService.create` → `PolicyEngine.evaluate` →
   (approval if required) → `ExecutionCoordinator.execute`. `AIbitat.invokeTool()` in
   `server/utils/agents/aibitat/index.js` routes through the boundary whenever
   `enableYusufGovernance()` was called; `filterFunctionsForRuntime()` hides ungoverned tools
   from a governed runtime entirely. Confirmed by `server/__tests__/yusufOS/unit/runtimeBoundary.test.js`
   (forged metadata, imported/MCP/Flow tools, direct handler calls all fail closed).

2. **Agents request; Policy alone assigns risk/outcome.** `IntentCanonicalizer.assertNoClientAuthority`
   rejects any caller-supplied `riskLevel`, `policyResult`, `allowed`, `adapterAuthority`,
   `executionKey`, etc. Only `PolicyEngine.evaluate` (server/domain/yusufOS/policy/PolicyEngine.js)
   sets `riskLevel`/`outcome`, from the code-owned capability registry plus grants/overrides —
   never from client input.

3. **`FORBIDDEN` cannot become an approval.** `PolicyEngine.evaluate` only creates an
   `ApprovalRequest` when `outcome === REQUIRE_APPROVAL`; a `HARD_FORBIDDEN` capability
   (`server/domain/yusufOS/capabilities/registry.js`) always resolves to `FORBIDDEN`, which
   `ExecutionCoordinator.execute` explicitly re-checks and rejects even if somehow reached.
   Test: `securityCore.test.js` — "hard forbidden persists FORBIDDEN, audits, and creates no approval".

4. **Approval is durable, payload/version/resource/account-bound, and one-use.**
   `ApprovalService.validateForConsumption` invalidates on payload hash change, intent version
   change, target/resource/account digest change, capability version change, or a changed
   agent grant/project override — before the approval can be consumed. `consumeInTransaction`
   uses a conditional `updateMany` (optimistic version match) so only one caller can ever
   consume a given approval. Tests cover payload/version/resource/account drift and a concurrent
   double-decision race (exactly one winner).

5. **Server owns idempotency and execution identity.** `intentFingerprint` is a unique DB
   constraint derived from `runId + agentId + principal + payloadHash` (never client-supplied);
   `IntentService.create` returns the existing row on a `P2002` conflict instead of creating a
   duplicate. `ExecutionCoordinator` refuses to retry an intent that already has a receipt in
   `EXECUTING`/`SUCCEEDED`/`UNKNOWN`.

6. **`FAILED_UNKNOWN` blocks retry; only `reconcile()` may resolve it.** A verifier throw or an
   adapter failure with uncertain effect (`error.effectCertain !== true`) becomes `UNKNOWN`, and
   `ExecutionCoordinator.execute` on that intent again throws `EXECUTION_UNKNOWN` rather than
   re-running. Only `reconcile()`, gated by a conditional claim on the receipt, may resolve it.

7. **Audit is dedicated, append-only, hash-chained, HMAC-checkpointed.**
   `server/domain/yusufOS/audit/AuditService.js`: each event's hash includes `previousHash`;
   `yusuf_audit_checkpoints` is updated with a conditional `updateMany` keyed on the previous
   checkpoint state (fails closed on a lost race) and signed with
   `HMAC-SHA256(YUSUF_OS_AUDIT_HMAC_KEY)`. `verify()` detects event mutation, sequence gaps,
   previous-hash rewrites, checkpoint mismatch/deletion, and checkpoint-signature forgery without
   the key. The key is required at runtime (`≥32 chars`, read from `process.env`, never stored
   in the DB) — if missing, audit append and control-plane auth both fail closed (503), they do
   not silently proceed.

8. **Yusuf control-plane mutations are localhost-only and fail-closed authenticated.**
   `server/domain/yusufOS/api/controlPlaneGuard.js`: requires `remoteAddress` in a fixed loopback
   set *and* rejects the request outright if `x-forwarded-for`/`forwarded`/`x-real-ip` is present
   (so a reverse proxy can't spoof "local"); requires a `Bearer` token from
   `YUSUF_OS_CONTROL_TOKEN` (≥32 chars) compared with `timingSafeEqual`; enforces a 256KB body
   cap independent of AnythingLLM's normal 3GB body limit. Mounted in `server/index.js` *before*
   the legacy body parsers, with its own request-id middleware
   (`server/domain/yusufOS/api/requestContext.js`).

9. **Raw secrets are rejected before persistence; redaction is defense in depth, not the
   primary control.** `IntentCanonicalizer` calls `assertReferencesOnly()`
   (`server/domain/yusufOS/security/redaction.js`) which throws if any sensitive-looking key
   holds anything other than an opaque `{ secretRef: "..." }` handle. Everything actually
   persisted (targets, payloads, receipts, audit metadata) additionally passes through
   `redactForPersistence`/`redactString`, which strip common token/cookie/private-key patterns
   as a second layer.

10. **Scheduled/unattended jobs cannot auto-approve.** This was a real vulnerability that was
    fixed in this branch (see `GATE_HISTORY.md` for the diff). `server/jobs/run-scheduled-job.js`
    now runs `EphemeralAgentHandler` with `blockUngovernedExtensions: true` (excludes imported
    JS plugins, Agent Flows, and MCP tools entirely from unattended runs) and replaces the old
    `requestToolApproval = () => ({ approved: true })` with
    `denyUnattendedToolApproval` (`server/jobs/helpers/scheduled-approval-policy.js`), which
    always returns `approved: false`. `ScheduledJob.create/update` and the scheduled-jobs
    endpoint additionally reject any tool not in the tiny code-owned
    `SAFE_UNATTENDED_SCHEDULED_TOOLS` allowlist (`rag-memory`, `document-summarizer`) at
    creation/update time, not just at run time. Yusuf-governed L3+ capabilities still go through
    the normal Action Boundary → durable approval path even from a schedule (principal type
    `SCHEDULE`), and wait, they don't bypass anything.

## Things to never do (would violate the above)

- Never let a DB row (project override, agent grant) *downgrade* a `HARD_FORBIDDEN` capability —
  policy precedence is: hard-forbidden > kill switch > project restriction > agent grant >
  capability default > approval requirement, and only *increasing* restriction via override is
  supported (`PolicyEngine.stricterOutcome`/`stricterRisk`).
- Never add a code path that calls a governed tool's `handler` directly — it's designed to always
  throw; there is no "trusted caller" exception in the current design.
- Never treat `EXECUTED_UNVERIFIED` or `FAILED_UNKNOWN` as terminal success — verification is a
  distinct step from execution, and an unknown external outcome must reconcile, not blindly retry.
