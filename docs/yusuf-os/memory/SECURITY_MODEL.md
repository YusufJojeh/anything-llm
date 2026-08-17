# Security Model — operational map

Full threat model: `docs/yusuf-os/gate-b/anything-llm-threat-model.md`. This file is a fast
reference to the operational mechanics, verified against code in `ARCHITECTURE_INVARIANTS.md`.

## Trust boundaries

- **Yusuf control plane** (`/api/yusuf-os/*`): localhost-only (loopback address, no forwarded
  headers accepted), bearer token from `YUSUF_OS_CONTROL_TOKEN` (≥32 chars, `timingSafeEqual`),
  256KB body cap, fails closed (503) if the token env var isn't configured. Independent of
  AnythingLLM's normal single-user fail-open behavior.
- **AnythingLLM legacy API**: unchanged, still governed by AnythingLLM's own multi-user/
  single-user auth — Yusuf OS does not weaken or depend on it.
- **Agent runtime (AIbitat)**: governed only when `enableYusufGovernance()` is explicitly called;
  legacy/non-Yusuf sessions are unaffected (deliberate — Yusuf OS is additive, not a rewrite of
  all agent behavior yet).

## Risk levels → policy outcomes

`L0 READ < L1 ANALYZE < L2 LOCAL_WRITE < L3 EXTERNAL_MUTATION < L4 CRITICAL_OR_DESTRUCTIVE`.
Outcomes: `ALLOW < REQUIRE_APPROVAL < DENY < FORBIDDEN` (strictness order, not risk order —
`FORBIDDEN` is stronger than "needs approval", and an override can only make an outcome
*stricter*, never looser). `FORBIDDEN` is fixed per-capability in the code-owned registry
(`HARD_FORBIDDEN` list) and cannot be reached by policy configuration alone — only by a
capability actually being on that list.

## Current hard-forbidden set [VERIFIED_FROM_REPOSITORY: server/domain/yusufOS/capabilities/registry.js]

`credential.extract`, `browser.cookie.export`, `browser.session_token.export`,
`private_key.read`, `policy.bypass`, `policy.modify_by_agent`, `approval.modify_by_agent`,
`approval.bypass`, `audit.modify_history`, `audit.delete_history`,
`protected_branch.force_push`, `protected_branch.direct_push`,
`unrestricted_shell_with_secrets`.

## Approval lifecycle

`PENDING → APPROVED → CONSUMED`, or terminal `REJECTED`/`EXPIRED`/`INVALIDATED`. Bound to:
payload hash, intent version, target identity digest, resource version, account identity digest,
capability version, and the policy decision that created it. Any drift invalidates before
consumption is even attempted — see `ApprovalService.validateForConsumption`.

## `FAILED_UNKNOWN`

Used whenever an external side effect's actual outcome can't be proven (adapter execution threw
with `effectCertain !== true`, or the verifier itself threw). Blind retry is refused by the
`ExecutionCoordinator` (an intent with an `EXECUTING`/`SUCCEEDED`/`UNKNOWN` receipt cannot be
re-executed); only `ExecutionCoordinator.reconcile()` — itself claimed via a conditional update
so only one caller can run it — may resolve it.

## Kill switch

`yusuf_security_settings` key `EXTERNAL_MUTATIONS_DISABLED`. When set, `PolicyEngine` denies any
new L3+ intent, and `ApprovalService.validateForConsumption` blocks execution of an
*already-approved* L3+ approval too (without consuming it — the approval survives so it can run
once the switch is turned back off). Only a `USER` principal may flip it
(`assertHumanPrincipal`).

## Audit

Append-only through `AuditService`; each event's hash chains to `previousHash`; a single
`yusuf_audit_checkpoints` row (key `PRIMARY`) tracks the tip and is HMAC-signed with
`YUSUF_OS_AUDIT_HMAC_KEY` (required env var, ≥32 chars, never stored in the DB). Concurrent
appends serialize through both an in-process promise queue (`appendQueues` WeakMap) and a
DB-level conditional `updateMany` on the checkpoint, so a lost race throws rather than silently
corrupting the chain. `verify()` walks the full chain and detects: event mutation, sequence gaps,
previous-hash rewrites, checkpoint/tail mismatch (covers full deletion of the last event or all
events), and checkpoint-signature forgery attempted without the real key. Described accurately as
**tamper-evident**, not cryptographically immutable storage — nothing stops someone with raw DB
access from deleting rows, but `verify()` will detect it.

## Secret handling

Two layers: (1) intake rejection — `assertReferencesOnly` throws if any request field with a
secret-shaped key (`token`, `password`, `apikey`, `privatekey`, `cookie`, etc., matched
case/punctuation-insensitively) holds anything other than an opaque `{secretRef: "..."}`
pointer; (2) persistence redaction — `redactForPersistence`/`redactString` strip
Bearer/Basic auth headers, PEM private key blocks, common `TOKEN=`/`PASSWORD=` patterns, and
known credential prefixes (`ghp_`, `sk-`, `AKIA`, `xox[baprs]-`, etc.) from anything actually
written to receipts/audit metadata, as defense in depth even if something slipped past intake.

## Required environment configuration (names only — never store values here)

- `YUSUF_OS_AUDIT_HMAC_KEY` — ≥32 chars, required for audit append/verify to work at all.
- `YUSUF_OS_CONTROL_TOKEN` — ≥32 chars, required for the `/api/yusuf-os/*` control plane to work
  at all. Neither is committed to the repo; both must be present in the runtime environment
  before the corresponding subsystem will do anything (fails closed, not silently insecure).
