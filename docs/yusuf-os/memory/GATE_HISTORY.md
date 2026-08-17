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
