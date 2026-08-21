# Current State — two-minute orientation

_Last verified: 2026-08-21, Phase T pass._

**Phase T added:** a real governed reasoning loop wired to `RoutedModelClient`, strict structured
decisions, central trust-separated prompt assembly, capability/context-aware routing, durable
leases and aggregate budgets, cancellation across model/provider/adapter stages, and routed
Reviewer verdict provenance with atomic lifecycle finalization. Fresh review: P0=0/P1=0/P2=3.
Full Yusuf OS backend: 51 suites, 712 passed, one optional live Ollama smoke skipped. Commit
`fe7ebac8`.

**Current next phase:** U, the Voice / Audio Plane.

_Prior Phase S orientation record (2026-08-21). See `CURRENT_GATE.md` for
the full record; Phases H, I, the Organization model, J, K, L, M, N, O, P, Q, and R have all landed
since the line below was last true — read `CURRENT_GATE.md` top-to-bottom rather than trusting
this summary's detail below, which is not fully re-verified this pass._

**Phase S added:** guarded real runtime projections plus `/os/runtime`, with honest provider/model
telemetry, organization/job counts, Monitoring history, and counts-only Knowledge/Memory/Evidence
visibility. Runtime refresh is isolated from the existing dashboard and explicitly timestamped.
Independent review is clean at P0/P1/P2 = 0 after fixing seven findings. Commit `47da3247`.

**Current next phase:** T, the real Agentic Reasoning Loop. It is not built yet.

**Phase R added:** a provider-neutral model runtime (`server/domain/yusufOS/models/`) — Ollama
(local, auto-discovered, never auto-pulls) and OpenAI (env-key-only) behind one `ModelRouter`, with
`RoutedModelClient` as the sanctioned production `ModelClient` and telemetry persisted onto the
existing `AgentRun` record. Model routing is explicitly outside the security boundary (not a
governed side effect); cost is informational only. No live agentic loop calls it yet — see
`DEFERRED_WORK.md`. Also closed a real `ExecutionCoordinator` pre-claim orphan gap found while
reading it for this phase.

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

**What has passed (as of Phase Q):** 70/70 server suites, **913/913 tests** (see `TEST_BASELINE.md`
for the exact command and per-phase deltas); frontend counts not re-verified this phase (no
frontend change). Server lint clean, `git diff --check` clean.

**Also built since the line above was last fully verified:** Phase H (read-only Browser Broker),
Phase I (`browser.submit_form`, the first governed browser mutation), the Organization model
(code-owned Department/AutonomyLevel labels, never consulted by Policy/Approval), Phase J
(Knowledge/Evidence/Memory split), Phase K (Monitoring — the first `AUTONOMOUS`-level Agent,
`system.read_health`/`monitoring.record_check`, a new risk-ceiling invariant for any AUTONOMOUS
Agent), Phase L (Career — job opportunity tracking through a strictly-forward code-owned
transition table), Phase M (Marketing — content tracking through a transition table with two
deliberate backward edges for revision loops), and **Phase N (Founder — venture tracking through
a branching transition table with one resume edge, `founder.read_ventures`/
`founder.record_venture`/`founder.update_status` — the third phase running where independent
review found nothing to fix, this time specifically confirming the branching graph can't be
chained to skip a required pipeline stage — see `CURRENT_GATE.md`), Phase O (Research — question
tracking), Phase P (Sales/Inbox — message tracking with a code-enforced, not merely validated,
Career integration seam via `inbox.advance_linked_career_status`), and Phase Q (Application
submission seam — `career.prepare_application` plus granting Career the pre-existing
`browser.submit_form`, closing out Yusuf's own end-to-end job-application scenario to the extent
scoped; chosen explicitly by Yusuf via AskUserQuestion over two other options).**

**Next gate:** none chosen yet. Per Yusuf's own direction to "attempt the end-to-end scenario,"
that has now been done (Phase Q). Integrations, Model routing/cost, Command Center expansion,
hardening, and release/ops all remain undefined in scope — do not start any of them without
Yusuf's explicit instruction; see `DEFERRED_WORK.md`.

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
