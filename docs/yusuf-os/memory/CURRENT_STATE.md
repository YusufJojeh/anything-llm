# Current State — two-minute orientation

_Last verified: 2026-08-20, Phase N (Founder) pass. See `CURRENT_GATE.md` for the full record;
Phases H, I, the Organization model, J, K, L, M, and N have all landed since the line below was
last true — read `CURRENT_GATE.md` top-to-bottom rather than trusting this summary's detail below,
which is not fully re-verified this pass._

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

**What has passed (as of Phase N):** 66/66 server suites, **825/825 tests** (see `TEST_BASELINE.md`
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
chained to skip a required pipeline stage — see `CURRENT_GATE.md`).**

**Next gate:** whatever comes after Founder in the CAVEMAN MODE implementation order — Research,
Sales/Inbox, Integrations, Model routing/cost, Command Center expansion, hardening, release/ops —
not started, no design doc exists yet; see `DEFERRED_WORK.md`.

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
