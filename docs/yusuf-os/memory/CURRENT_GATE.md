# Current Gate

_Last updated: 2026-08-17 (Gate F implementation pass). Gate F complete; Gate G not started._

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

## Gate F — Command Center Backend Projections — status: COMPLETE

Read-only projections implementing `docs/yusuf-os/gate-b/api-realtime-frontend.md` §4-5. **No UI
was built.** See `GATE_HISTORY.md` for the full record including the six independent-review
findings that were fixed. Surface:

- `GET /api/yusuf-os/dashboard` — the normalized §4 projection.
- `GET /api/yusuf-os/events?after=` — cursor-paged `YusufEventEnvelope`s.
- `GET /api/yusuf-os/events/stream` — SSE with `Last-Event-ID` resume and reset frames.
- `POST /api/yusuf-os/audit-integrity/check` — the only path that walks the chain.

All behind the existing localhost + bearer-token control-plane guard.

## Next gate: Gate G — Command Center frontend [PLANNED, not started]

**Objective:** build the `/os` experience against the Gate F projections. **Read
`docs/yusuf-os/memory/FRONTEND_VISION.md` first** — the approved direction is a relationship-
centric AI Staff Command Center (agent constellation with real delegation/handoff/review edges),
not a CRUD dashboard, with an equally-capable non-graph accessible view, RTL, and reduced-motion
support. No fake data: every value must come from a Gate F projection.

**Blockers before starting:** none technical; **waiting on Yusuf's explicit instruction.**
