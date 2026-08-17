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
  `execution/InMemoryTestAdapter.js` — execution/verification/reconciliation, and the adapter
  interface (only an in-memory test adapter exists today — no real adapter yet).
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

`server/models/yusufOS/`: `agent.js`, `agentRun.js`, `project.js`, `task.js` — thin Prisma-backed
model wrappers for `yusuf_agents`, `yusuf_agent_runs`, `yusuf_projects`, `yusuf_tasks`.

## Yusuf OS API

`server/endpoints/yusufOS/index.js` — mounted at `/api/yusuf-os/*` in `server/index.js`
(pre-guarded by `yusufControlPlaneGuard` before the legacy body parsers). Routes: bootstrap,
agents, projects, tasks, runs, intents/:id, approvals (list/get/decide), audit-events,
audit/verify. All read/write through `db.yusuf_*` Prisma tables directly except where a model
wrapper exists.

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

## Future `/os` frontend

Does not exist yet. Deliberately kept separate from the rest of `frontend/` per Gate B
(`docs/yusuf-os/gate-b/api-realtime-frontend.md`). See `ROADMAP.md` for the intended shape.
