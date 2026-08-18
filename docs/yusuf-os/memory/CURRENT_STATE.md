# Current State — two-minute orientation

_Last verified: 2026-08-18, Phase H (Browser Broker) pass._

**Branch:** `feature/yusuf-os-core`. Seven local checkpoint commits (Gate B docs, Gate C core,
Claude memory, Gate D LocalGit, Gate E agent runtime, Gate F projections, Gate G frontend), all
unpushed. `origin` =
`github.com/YusufJojeh/anything-llm` (push only with explicit approval). `upstream` =
`github.com/Mintplex-Labs/anything-llm` (fetch only, push disabled).

**What's already built:**
- Gate B (design docs, `docs/yusuf-os/gate-b/`).
- Gate C (deterministic security/control-plane kernel: capability registry, policy engine,
  action boundary, approval service, execution coordinator, tamper-evident audit, control-plane
  API, mandatory runtime interception).
- Gate D (governed LocalGit adapter — the first real adapter and the first real L3 side effect,
  `git.push_feature_branch`, against a disposable local repo + bare remote).
- **Gate F (Command Center backend projections)** — read-only `/dashboard`, `/events`, SSE
  `/events/stream`, and `POST /audit-integrity/check`, all behind the control-plane guard. The
  event stream is derived from the existing audit chain rather than a second event store.
- **Gate E (the first governed AI staff runtime)** — three real Agents with isolated
  capabilities (Chief of Staff orchestrates and holds *zero* capabilities; Engineering holds the
  write/git capabilities; Reviewer is read-only), durable Handoffs, independent Reviewer
  verdicts, a deterministic completion gate, a rework loop, and two new governed capabilities
  (`project.write_file`, `project.run_command` via a server-owned typed command registry — no
  raw shell).

- **Gate G (the `/os` AI Staff Command Center frontend)** — the first UI. An agent constellation
  drawn from the real roster with real `yusuf_handoffs` edges, a system core whose semantic state
  is derived only from asserted values, an Attention Queue, agent/task/run/approval drilldowns, a
  System Health surface, and snapshot-first SSE reconciliation. Plus the browser session
  bootstrap that lets a browser reach the control plane without ever holding the control token.

**What has passed:** 53/53 server suites, **607/607 tests**; 7/7 frontend suites, **129/129 tests**;
frontend lint + build clean, server lint clean, `git diff --check` clean. All re-run live this
session.

**Next gate:** not defined. Do not begin anything without Yusuf's explicit instruction.

**Must not be rebuilt:** the Gate C kernel (still unmodified in `runtime/`, `policy/`,
`approvals/`, `execution/ExecutionCoordinator.js`, `audit/`), the Gate D LocalGit adapter, and
the Gate E agent runtime. Extend; don't replace.

**Currently deferred (do not assume built):** the `/os` modules beyond the ten routes above
(career, marketing, founder, knowledge, evidence, cost, integrations, schedules, audit browser),
real LLM provider wiring for agent reasoning (core runtime uses a deterministic model client so
CI needs no API key), shell adapter, browser/Open Computer, GitHub API/real network push,
Gmail/LinkedIn/WhatsApp/Calendar, governed MCP side effects, governed SQL, the full specialist
agent roster beyond the three core roles, Memory Curator. Full list in `DEFERRED_WORK.md`.

**Open/residual items:** see `KNOWN_RISKS.md`. No P0/P1 as of this session — but note that
**six** real issues were found and fixed during Gate E, three by the in-gate self-review (dropped
CHECK constraints, caller-asserted validation evidence, cross-task evidence injection) and three
more by a *later independent* review of the committed code (write_file+run_command composing into
arbitrary code execution; no task-project binding on the model-chosen `repositoryId`; the recorded
`evidenceDigest` never being verified). See `GATE_HISTORY.md`. The lesson is recorded there:
self-review is materially weaker than independent review — do not claim P0/P1 = 0 from a
self-audit alone.
