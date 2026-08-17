# Yusuf OS Gate B Design Package

Status: **Design baseline — awaiting Gate C approval**  
Scope: architecture, contracts, threat model, and acceptance-test design only.  
Baseline: AnythingLLM `1.16.0`, single user, SQLite, browser-first, local-tool-first.

No runtime code, Prisma schema, migration, frontend, integration, Git remote, or external service is changed by this package.

## Non-negotiable decisions

1. Every governed action crosses one mandatory `ActionBoundary`.
2. Agents request semantic capabilities; Policy assigns risk and authority.
3. `ActionIntent` is adapter-neutral. `ExecutionPlan` is broker-owned.
4. L3 requires durable approval. L4 requires per-operation confirmation or is `FORBIDDEN`.
5. Approval is bound to canonical payload, target, account constraints, resource versions, and policy decision—not normally to an adapter.
6. Server-owned execution keys and conditional transitions prevent duplicate decisions and effects.
7. Unknown external outcomes reconcile before retry.
8. Yusuf control-plane mutations are localhost-only and fail-closed authenticated.
9. Security audit is dedicated, append-only through the application, and hash-chained for tamper evidence.
10. Browser and local CLI sessions remain user-controlled; their authentication never grants agent authority by itself.

## Package map

| Gate B deliverable | Design artifact |
|---|---|
| Architecture, bounded contexts, trust boundaries | [architecture.md](architecture.md) |
| Principal, agent, capability, policy, intent, approval, execution, receipt, task, run, adapter contracts | [domain-contracts.md](domain-contracts.md) |
| Execution/approval state machines, idempotency, recovery, SQLite concurrency, audit chain | [state-machines-and-persistence.md](state-machines-and-persistence.md) |
| Browser session, LocalGit, CLI, MCP, imported skills, flows, SQL, scheduler | [adapter-governance.md](adapter-governance.md) |
| API, realtime, projections, frontend, accessibility and RTL | [api-realtime-frontend.md](api-realtime-frontend.md) |
| Repository-grounded security analysis | [anything-llm-threat-model.md](anything-llm-threat-model.md) |
| Acceptance tests for Gate C/D | [acceptance-tests.md](acceptance-tests.md) |
| Exact Gate C and Gate D plans | [implementation-plan.md](implementation-plan.md) |
| Final completeness check, residual risks, and verdict | [gate-b-verdict.md](gate-b-verdict.md) |
| Architectural decisions and consequences | [adrs](adrs) |

## ADR mapping

The 24 requested ADR topics are merged where one decision has one inseparable consequence set.

| Requested ADRs | Consolidated record |
|---|---|
| 001, 002, 023 | [ADR-001](adrs/ADR-001-control-plane-and-agent-boundary.md) |
| 003, 004, 005 | [ADR-002](adrs/ADR-002-central-action-policy-boundary.md) |
| 006, 007, 009, 010 | [ADR-003](adrs/ADR-003-intent-approval-execution-and-identity.md) |
| 011, 012, 013 | [ADR-004](adrs/ADR-004-sqlite-recovery-and-audit.md) |
| 008 | [ADR-005](adrs/ADR-005-browser-first-local-tool-first.md) |
| 014, 015, 016 | [ADR-006](adrs/ADR-006-extension-and-network-governance.md) |
| 017, 018, 021 | [ADR-007](adrs/ADR-007-scheduling-realtime-and-projections.md) |
| 019, 024 | [ADR-008](adrs/ADR-008-knowledge-evidence-and-secrets.md) |
| 020 | [ADR-009](adrs/ADR-009-task-graph-and-completion-gates.md) |
| 022 | [ADR-010](adrs/ADR-010-upstream-compatibility.md) |

## Gate boundaries

- Gate B creates documentation only.
- Gate C may implement the control-plane kernel and persistence only after explicit approval.
- Gate D may implement the disposable LocalGit vertical slice only after Gate C is verified.
- Open Computer, Gmail, LinkedIn, WhatsApp, Calendar, external platform APIs, production browser automation, agents, and Command Center visuals remain deferred.
