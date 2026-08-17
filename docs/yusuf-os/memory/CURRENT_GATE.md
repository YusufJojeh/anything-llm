# Current Gate

_Last updated: 2026-08-17 (Gate E implementation pass). Gate E complete; Gate F not started._

## Gate E — First Governed AI Staff Runtime — status: COMPLETE

See `GATE_HISTORY.md` for the full record. Implemented and tested:

- **Three code-owned AgentDefinitions** (`server/domain/yusufOS/agents/definitions.js`):
  `chief_of_staff` (orchestrates, **zero** capabilities), `engineering` (project + git
  read/write incl. L3 push), `reviewer` (read-only). The role's allowlist is code-owned, so a DB
  grant can narrow a role but never widen it — `AgentRegistry.assertGrantAllowed` refuses.
- **Durable handoffs** (`yusuf_handoffs`) with a code-owned set of legal delegation edges,
  acting-agent verification (an Agent may only create a handoff *from itself*), and server-derived
  idempotency keys.
- **Independent review** (`yusuf_review_verdicts`): a verdict may only attach to a run whose
  `runKind` is `REVIEW` *and* whose owning agent is the `reviewer` role. `reviewRunId` is unique,
  so verdicts are immutable; history is append-only, so a later PASS never erases an earlier BLOCK.
- **Deterministic completion gate** (`orchestration/CompletionPolicy.js`): reads only persisted
  state (evidence rows, review verdicts, approval/intent status). Blockers:
  `NO_IMPLEMENTATION_EVIDENCE`, `NO_VALIDATION_EVIDENCE`, `VALIDATION_FAILED`, `NO_REVIEW`,
  `REVIEW_BLOCKED`, `REVIEW_STALE`, `APPROVAL_PENDING`, `SECURITY_BLOCKER`,
  `EXTERNAL_EFFECT_UNVERIFIED`.
- **Structured output contracts** (`agents/contracts.js`): model output is validated and any
  authority-bearing field (risk, policy, approval, verification, task status, review verdict,
  agent identity) is rejected at any nesting depth before it can reach a state transition.
- **Two new governed capabilities**: `project.write_file` (reuses Gate D's hardened path policy —
  project-root scoped, traversal/symlink/protected-path safe, atomic rename, before/after digest)
  and `project.run_command` (semantic key → server-owned executable+argv from
  `yusuf_project_commands`; executables restricted to a code-owned allowlist; `shell: false`;
  minimal env allowlist). **No raw shell, no arbitrary filesystem.**
- **Run lifecycle**: new `WAITING_TOOL` / `WAITING_HANDOFF` states, `RUN_FAILURE_KINDS` so
  failures stay distinguishable, server-derived run idempotency, durable concurrency limits.
- Migration `20260817180000_add_yusuf_os_agent_runtime` (additive; hand-corrected to preserve
  Gate C's CHECK constraints that Prisma's table-redefine drops).

## Next gate: Gate F — Command Center backend projections [PLANNED, not started]

**Objective:** expose normalized, queryable projections the future Command Center renders —
`systemStatus`, `agentStatuses`, `taskStatuses`, `approvalQueue`, `activeHandoffs`, `runProgress`,
`adapterHealth`, `costSummary`, `auditSummary` — over HTTP with SSE reconciliation, per
`docs/yusuf-os/gate-b/api-realtime-frontend.md` §§4-5.

**Starting point:** `ChiefOfStaff.taskState()` already returns the per-task shape (agents, real
handoff edges, review history, waiting approvals, completion assessment). Gate F generalizes this
across tasks/agents and adds the realtime delivery layer. Do **not** build UI in Gate F — see
`FRONTEND_VISION.md`.

**Blockers before starting:** none technical; **waiting on Yusuf's explicit instruction.**
