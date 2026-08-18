# Current Gate

_Last updated: 2026-08-18 (Gate G implementation pass). Gates B-G complete; Gate H not started._

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

## Gate G — AI Staff Command Center frontend — status: COMPLETE

The first frontend gate. `/os` is a relationship-centric AI Staff Command Center built strictly
against the Gate F projections; `/` is untouched. See `GATE_HISTORY.md` for the full record.

- **Feature module** `frontend/src/features/yusufOS/` (api / realtime / state / components /
  i18n / styles) plus routes under `frontend/src/pages/YusufOS/`. No new state library, no graph
  library — the constellation is arithmetic on a unit circle rendered as plain SVG.
- **Routes:** `/os`, `/os/agents`, `/os/tasks`, `/os/tasks/:taskId`, `/os/approvals`,
  `/os/approvals/:approvalId`, `/os/runs`, `/os/runs/:runId`, `/os/projects`, `/os/system`.
- **Browser auth bootstrap** (`server/domain/yusufOS/api/uiSession.js`): the control token is
  exchanged once, over loopback, for an httpOnly + SameSite=Strict server-side session with a
  double-submit CSRF token. Same secret, same comparison, same loopback rule as the bearer
  guard; `/api/yusuf-os/*` is completely unchanged.
- **Additive uuid-addressed drilldown projections** (`projections/DetailProjections.js`) closing
  a real Gate F contract gap — see `KNOWN_RISKS.md`.
- **Snapshot-first + SSE reconciliation**: HTTP `/dashboard` is authoritative; the stream only
  decides *when to refetch*. Duplicates, out-of-order, gaps, resets, unknown schema versions,
  reconnects and visibility restores all resolve to "reload the snapshot".
- **No fake data**: real zero, unknown, LOADING, EMPTY and ERROR are five distinct states, and
  UNCHECKED/STALE audit verdicts never render as healthy.

## Next gate: Gate H — not defined [not started]

**Blockers before starting:** none technical; **waiting on Yusuf's explicit instruction.**
Candidate deferred work is listed in `DEFERRED_WORK.md` (real LLM provider wiring, the remaining
`/os` modules, RFC 9457 error migration).
