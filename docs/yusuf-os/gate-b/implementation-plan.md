# Gate C and Gate D Implementation Plan

This plan is not authorization to implement either gate.

## 1. Gate C objective

Implement the smallest secure Yusuf OS kernel: localhost/fail-closed control plane, durable domain state, mandatory governed dispatch, policy/approval state machines, tamper-evident audit, and tests. No production browser, external API, full agents, or Command Center UI.

## 2. Gate C exact add plan

Proposed additions, adjusted to the repository's CommonJS model conventions during implementation:

```text
docs/yusuf-os/gate-c/

server/endpoints/yusufOS/index.js
server/endpoints/yusufOS/agents.js
server/endpoints/yusufOS/tasks.js
server/endpoints/yusufOS/approvals.js
server/endpoints/yusufOS/runs.js
server/endpoints/yusufOS/audit.js
server/endpoints/yusufOS/adapters.js
server/endpoints/yusufOS/events.js

server/utils/middleware/yusufOSControlPlane.js
server/utils/yusufOS/constants.js
server/utils/yusufOS/validation.js
server/utils/yusufOS/canonicalJson.js
server/utils/yusufOS/redaction.js

server/utils/yusufOS/identity/Principal.js
server/utils/yusufOS/agents/AgentRegistry.js
server/utils/yusufOS/tasks/TaskService.js
server/utils/yusufOS/actions/ActionBoundary.js
server/utils/yusufOS/actions/IntentCanonicalizer.js
server/utils/yusufOS/policy/PolicyEngine.js
server/utils/yusufOS/policy/rules/coreRules.js
server/utils/yusufOS/approvals/ApprovalService.js
server/utils/yusufOS/execution/ExecutionBroker.js
server/utils/yusufOS/execution/ExecutionCoordinator.js
server/utils/yusufOS/execution/Reconciler.js
server/utils/yusufOS/audit/AuditChain.js
server/utils/yusufOS/realtime/EventProjection.js

server/models/yusufOS/agent.js
server/models/yusufOS/task.js
server/models/yusufOS/agentRun.js
server/models/yusufOS/actionIntent.js
server/models/yusufOS/policyDecision.js
server/models/yusufOS/approvalRequest.js
server/models/yusufOS/executionPlan.js
server/models/yusufOS/actionReceipt.js
server/models/yusufOS/auditEvent.js

server/prisma/migrations/<timestamp>_add_yusuf_os_core/migration.sql

server/__tests__/yusufOS/unit/
server/__tests__/yusufOS/integration/
server/__tests__/yusufOS/security/
server/__tests__/yusufOS/fixtures/
```

File names are proposed, not binding. Gate C should prefer fewer modules if implementation proves some boundaries are cohesive, but must not collapse Policy, Approval, Broker, and Verification into one authority.

## 3. Gate C exact modify plan

```text
server/prisma/schema.prisma
server/index.js
server/utils/agents/aibitat/index.js
server/jobs/run-scheduled-job.js
server/utils/agents/ephemeral.js
server/utils/MCP/index.js
server/utils/MCP/hypervisor/index.js
server/utils/agentFlows/executor.js
server/utils/agents/imported.js
server/__tests__/utils/agents/imported.test.js
```

Modification rules:

- `schema.prisma`: append isolated `yusuf_*` models; no edits to existing tables unless separately justified.
- `server/index.js`: register isolated Yusuf endpoints and fail-closed control-plane boot checks.
- `aibitat/index.js`: both tool invocation paths terminate at a single governed dispatch abstraction. Legacy pure/read tools use explicit compatibility classification.
- scheduled runner: delete unconditional approval override and route governed requests to durable suspension.
- MCP/flows: no mutation until capability mapping/interception exists.
- imported skills: reverse unsafe no-channel auto-approval expectations and exclude arbitrary code from Yusuf Agents.
- SQL: exclude existing raw tool from Yusuf Agents; deterministic governed SQL may be a later sub-gate.

## 4. Gate C sequencing

1. Correct Git remote topology after explicit Yusuf authorization; create `feature/yusuf-os-core` from the Yusuf fork.
2. Add contract constants, canonical JSON/hash, redaction, and pure policy tests.
3. Add Prisma models and one expand-only migration.
4. Add repositories/models with conditional transitions and temporary-SQLite integration tests.
5. Add Principal and fail-closed localhost middleware tests.
6. Add ActionBoundary, PolicyDecision, approval, execution claim, receipt and audit chain.
7. Intercept AIbitat's two final handler dispatch points.
8. Remove scheduled auto-approval and implement durable waiting/resume coordinator.
9. Gate MCP and flow execution; default unmapped mutations to deny.
10. Add read-only internal APIs and approval decision command.
11. Add SSE projection only if needed for kernel verification; polling is an acceptable temporary client.
12. Run full server/unit/integration/security checks and migration verification on temporary/copy databases.

No frontend redesign belongs in Gate C.

## 5. Gate D objective

Prove the kernel through one LocalGit vertical slice without GitHub or another external API.

```text
Task request
→ inspect disposable repository
→ create feature branch
→ scoped file change
→ project-declared test
→ local commit
→ L3 push intent
→ durable Yusuf approval
→ push to disposable bare remote
→ verify remote ref
→ receipt, audit and completion gates
```

## 6. Gate D exact add plan

```text
server/utils/yusufOS/adapters/AdapterRegistry.js
server/utils/yusufOS/adapters/localGit/LocalGitAdapter.js
server/utils/yusufOS/adapters/localGit/capabilities.js
server/utils/yusufOS/adapters/localGit/repositoryIdentity.js
server/utils/yusufOS/adapters/localGit/pathPolicy.js
server/utils/yusufOS/adapters/localGit/gitProcess.js
server/utils/yusufOS/adapters/localGit/verifier.js
server/utils/yusufOS/adapters/localGit/reconciler.js
server/utils/yusufOS/adapters/cli/TypedCommandRegistry.js
server/utils/yusufOS/adapters/cli/ProcessRunner.js

server/__tests__/yusufOS/fixtures/gitRepositoryFixture.js
server/__tests__/yusufOS/integration/localGitAdapter.test.js
server/__tests__/yusufOS/integration/localGitPushLifecycle.test.js
server/__tests__/yusufOS/security/localGitPathEscape.test.js
server/__tests__/yusufOS/security/localGitSecretRedaction.test.js
server/__tests__/yusufOS/reliability/localGitReconciliation.test.js
```

## 7. Gate D execution rules

- Tests create all repositories/remotes beneath a verified temporary root.
- No test reads or writes the real project `.git` directory.
- Git commands use argv arrays with shell disabled.
- Environment is minimal and test-local.
- Fixture remote is a local bare repository.
- `gh` is not required for the first proof.
- Push binds repository, remote, branch, expected local SHA and expected remote-before state.
- `main` and configured protected branches are `FORBIDDEN` targets.
- A side-effect timeout transitions to `FAILED_UNKNOWN` and reconciles with `git ls-remote`/bare-ref inspection before any retry.

## 8. Gate D completion criteria

- All AT-001 through AT-041 applicable to the kernel/Git slice pass.
- No external network dependency exists.
- No arbitrary raw shell is exposed.
- Path/junction/symlink escape tests pass on supported host semantics.
- Remote SHA verification is independent of adapter success text.
- Audit chain includes request, decision, consumption, execution and verification events.
- Existing AnythingLLM agent/chat behavior passes relevant regression checks.

## 9. Deferred work

- Production Chrome bridge.
- Open Computer.
- Gmail, LinkedIn, WhatsApp, Calendar, job sources and external platform APIs.
- MCP mutation adapters beyond deny-by-default registration.
- Sandboxed imported extensions.
- Governed SQL implementation.
- Full Agent Registry population and Chief of Staff.
- `/os` Command Center implementation.
- PostgreSQL migration.

