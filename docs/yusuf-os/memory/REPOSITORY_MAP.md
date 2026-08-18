# Repository Map [VERIFIED_FROM_REPOSITORY, 2026-08-17]

## AnythingLLM upstream runtime (reused, mostly unmodified)

Everything under `server/`, `frontend/`, `collector/` not called out below — LLM provider
abstraction, Model Router, AIbitat agent runtime, RAG/vector retrieval, MCP hypervisor, Agent
Flows, imported skills, Scheduled Jobs, chat runtime, existing frontend. Treat as upstream;
prefer narrow, documented interception points over broad edits (see `CLAUDE.md`).

## Yusuf OS domain (security/control-plane kernel)

`server/domain/yusufOS/`:
- `capabilities/registry.js` — code-owned capability + hard-forbidden definitions (single source
  of security truth; DB cannot redefine these).
- `policy/PolicyEngine.js` — sole place risk/outcome is decided.
- `runtime/YusufActionBoundary.js` — sole governed-tool dispatch path.
- `approvals/ApprovalService.js` — durable approval lifecycle + consumption validation.
- `execution/ExecutionCoordinator.js`, `execution/AdapterContract.js`,
  `execution/InMemoryTestAdapter.js` — execution/verification/reconciliation, the adapter
  interface, and a test-only in-memory implementation. `adapters/localGit/LocalGitAdapter.js`
  (Gate D) is the first real implementation — see below.
- `audit/AuditService.js` — hash-chained, HMAC-checkpointed append-only audit.
- `actions/IntentCanonicalizer.js`, `actions/IntentService.js` — request canonicalization,
  server-owned idempotency (`intentFingerprint`).
- `security/canonicalJson.js`, `security/redaction.js`, `security/SecuritySettings.js` —
  canonical hashing, secret redaction, the external-mutations kill switch.
- `identity/principals.js` — principal normalization (`USER`/`AGENT`/`SCHEDULE`/`SYSTEM`).
- `api/requestContext.js`, `api/controlPlaneGuard.js`, `api/validation.js`,
  `api/errorHandler.js` — the `/api/yusuf-os/*` transport layer.
- `state/transitions.js`, `constants.js`, `errors/YusufOSError.js` — shared enums/state rules.

## Yusuf OS models

`server/models/yusufOS/`: `agent.js`, `agentRun.js`, `project.js`, `task.js`, `gitRepository.js`
(Gate D) — thin Prisma-backed model wrappers for `yusuf_agents`, `yusuf_agent_runs`,
`yusuf_projects`, `yusuf_tasks`, `yusuf_git_repositories`.

## Gate D — LocalGit adapter

`server/domain/yusufOS/adapters/localGit/`:
- `LocalGitAdapter.js` — implements `GovernedAdapter`; dispatches by capability key.
- `repositoryIdentity.js` — resolves + re-validates a `yusuf_git_repositories` binding against
  live disk state on every call.
- `pathPolicy.js` — canonical path resolution, directory-pathspec/protected-path/traversal/
  symlink-escape/option-injection denial for `git.stage_paths`.
- `branchPolicy.js` — branch name / single-revision validation, protected-branch detection.
- `remoteIdentity.js` — credential-free remote fingerprinting; rejects embedded credentials.
- `gitProcess.js` — hardened `git` invocation: argv-only, hooks/credential-helper/external-diff/
  textconv/fsmonitor neutralized, minimal allowlisted child environment.
- `shapes.js`, `snapshot.js` — shared resource/target object shapes and live git-state readers,
  used identically by the request builders and by `LocalGitAdapter.preflight()` so the two never
  drift into incompatible canonical-hash inputs.
- `requestBuilders.js` — one `buildActionRequest`-shaped function per capability; not yet wired
  to a real agent tool (Gate E) but used directly by the Gate D test suite.
Fixture: `server/__testUtils__/yusufOS/gitRepositoryFixture.js` (disposable working repo + local
bare remote, no network).

## Yusuf OS API

`server/endpoints/yusufOS/index.js` — mounted at `/api/yusuf-os/*` in `server/index.js`
(pre-guarded by `yusufControlPlaneGuard` before the legacy body parsers). Routes: bootstrap,
agents, projects, tasks, runs, intents/:id, approvals (list/get/decide), audit-events,
audit/verify, plus the Gate F projections (`dashboard`, `events`, `events/stream`,
`audit-integrity/check`) and the Gate G uuid-addressed drilldowns (`agents/roster`,
`tasks/:id/detail`, `runs/:id/detail`, `approvals/:id/review`). All read/write through
`db.yusuf_*` Prisma tables directly except where a model wrapper exists.

`yusufOSEndpoints` takes a `basePath`, and the **same handler set** is mounted twice in
`server/index.js`:
- `/api/yusuf-os/*` behind `yusufControlPlaneGuard` (loopback + `Authorization: Bearer`);
- `/api/yusuf-os-ui/*` behind `yusufUiSessionGuard` (loopback + browser session cookie + CSRF).

`server/domain/yusufOS/api/uiSession.js` — the browser bootstrap: `POST/GET/DELETE
/api/yusuf-os-ui/session`. Exchanges the same `YUSUF_OS_CONTROL_TOKEN` for an httpOnly,
SameSite=Strict, in-process session. Sessions never persist; a restart re-locks.

`server/domain/yusufOS/projections/` — `DashboardProjection.js`, `EventProjection.js` (Gate F),
`DetailProjections.js` (Gate G roster/task/run/approval-review).

## Yusuf OS tests

`server/__tests__/yusufOS/unit/*`, `server/__tests__/yusufOS/integration/*` — see
`TEST_BASELINE.md`. Test DB helper: `server/__testUtils__/yusufOS/testDatabase.js`.

## Yusuf OS docs

`docs/yusuf-os/gate-b/` — the authoritative detailed design record (architecture, domain
contracts, state machines, adapter governance, API/realtime/frontend, threat model, acceptance
tests, implementation plan, verdict, 10 ADRs). `docs/yusuf-os/memory/` — this directory, the
cross-session engineering memory. `.engineering-intelligence/gate-c.md` — Gate C evidence record.

## Prisma / migrations

`server/prisma/schema.prisma` — Yusuf OS tables added alongside upstream tables (381-line diff).
`server/prisma/migrations/20260817033000_add_yusuf_os_core/migration.sql` — the (additive-only,
per migration-safety practice) Gate C migration.

## Scheduled jobs (upstream, modified for governance)

`server/jobs/run-scheduled-job.js`, `server/jobs/helpers/scheduled-approval-policy.js`,
`server/models/scheduledJob.js`, `server/endpoints/scheduledJobs.js` — see
`ARCHITECTURE_INVARIANTS.md` invariant 10 for what changed and why.

## MCP / Agent Flows (upstream, minimally tagged)

`server/utils/MCP/index.js`, `server/utils/agentFlows/index.js` — single-line additions tagging
tools with `trustClassification: "EXTERNAL_TOOL_UNGOVERNED"` so a governed runtime can filter
them out; no behavior change for non-governed runtimes.

## Agent runtime (upstream, extended with governance hooks)

`server/utils/agents/aibitat/index.js` — `enableYusufGovernance()`, `invokeTool()`,
`filterFunctionsForRuntime()`, `isYusufGoverned()`. `server/utils/agents/defaults.js`,
`server/utils/agents/ephemeral.js` — `includeUngovernedExtensions`/`blockUngovernedExtensions`
flags threaded through workspace-agent and ephemeral-agent construction.
`server/utils/agents/imported.js` — fail-closed approval when no human approval channel exists;
`trustClassification: "LOCAL_PLUGIN_UNGOVERNED"` tag.

## `/os` frontend (Gate G)

Kept isolated from the rest of `frontend/` per Gate B
(`docs/yusuf-os/gate-b/api-realtime-frontend.md` §7).

`frontend/src/features/yusufOS/`
- `api/client.js` — control-plane client (relative `/api/yusuf-os-ui` base, CSRF header,
  normalized errors). **The only place a Yusuf OS HTTP call is made.**
- `realtime/eventReducer.js` — pure SSE reconciliation reducer.
- `state/` — `YusufOSProvider.jsx` (snapshot + stream + connection + session),
  `commandCenterModel.js` (projection → view model), `statusSemantics.js` (the single status
  vocabulary), `constellationLayout.js` (deterministic radial layout, no graph library).
- `components/` — `AgentConstellation` (SVG), `AgentRoster` (the accessible equivalent),
  `AttentionQueue`, `AgentDetailPanel`, `SystemHealth`, `Drawer`, `UnlockScreen`, `OSShell`,
  `ConnectionIndicator`, `primitives.jsx`.
- `i18n/` — `en.js` / `ar.js` in a dedicated `yusufOS` namespace (keeps `common` verifiable
  across its other locales); `styles/tokens.css` — the `.yos-root` token layer.
- `__tests__/` — Vitest suite, config at `frontend/vitest.config.js`.

`frontend/src/pages/YusufOS/` — route components; registered as a nested `/os` tree in
`frontend/src/main.jsx`. **`/` and every existing route are unchanged.**

Modified upstream frontend files (narrow diffs only): `frontend/src/main.jsx` (the `/os` route
tree), `frontend/tailwind.config.js` (scan `src/features/**`), `frontend/vite.config.js` (dev
proxy for `/api/yusuf-os-ui`), `frontend/package.json` (test scripts + dev-only test deps).

## Gate E additions (agent runtime)

- `server/domain/yusufOS/agents/` — `definitions.js` (code-owned roles + allowed capabilities),
  `AgentRegistry.js` (seeding, grant isolation, role assertions), `contracts.js` (structured
  output validation / authority-field rejection), `ModelClient.js` (provider-agnostic +
  deterministic test client + untrusted-content wrapping), `AgentRunCoordinator.js` (run
  lifecycle, idempotency, concurrency, evidence, telemetry), `toolBinding.js` (per-role governed
  toolsets over the Gate C Action Boundary).
- `server/domain/yusufOS/orchestration/` — `ChiefOfStaff.js` (deterministic orchestration:
  delegate, review request, rework, blockers, projection, completion), `CompletionPolicy.js`
  (the deterministic gate).
- `server/domain/yusufOS/handoffs/HandoffService.js` — durable agent-to-agent edges.
- `server/domain/yusufOS/review/ReviewService.js` — reviewer-owned, append-only verdicts.
- `server/domain/yusufOS/adapters/project/` — `ProjectAdapter.js` (governed file read/write +
  command run), `commandRegistry.js` (semantic key → server-owned invocation, code-owned
  executable allowlist), `processRunner.js` (argv-only, `shell:false`, minimal env),
  `requestBuilders.js`.
- `server/models/yusufOS/gitRepository.js` (Gate D) and the Gate E tables:
  `yusuf_handoffs`, `yusuf_review_verdicts`, `yusuf_run_evidence`, `yusuf_project_commands`,
  plus new columns on `yusuf_tasks` / `yusuf_agent_runs`. Migration
  `20260817180000_add_yusuf_os_agent_runtime`.
- Tests: `server/__tests__/yusufOS/security/agentRuntimeSecurity.test.js`,
  `server/__tests__/yusufOS/integration/agentOrchestration.test.js`; fixture
  `server/__testUtils__/yusufOS/agentFixture.js`.
- **No upstream AnythingLLM files were modified in Gate E** — the whole gate is additive under
  `server/domain/yusufOS/`, `server/models/yusufOS/`, and the test tree.
