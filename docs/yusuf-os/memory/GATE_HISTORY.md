# Gate History

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

## Gate D — Governed LocalGit Execution Vertical Slice

Status: **NOT STARTED.** Capability keys for it (`git.read_status`, `git.read_diff`,
`git.create_branch`, `git.commit_local`, `git.push_feature_branch`) already exist in the
code-owned registry but are hard-denied via the `GATE_D_DEFERRED` flag
(`PolicyEngine` forces `DENY` whenever a capability carries that flag, unconditionally, before
any grant/override is even consulted) — this is inert groundwork, not functioning Gate D code.
See `CURRENT_GATE.md` and `docs/yusuf-os/gate-b/implementation-plan.md` §§5-8 for the plan. Do
not start without Yusuf's explicit "START GATE D" instruction.
