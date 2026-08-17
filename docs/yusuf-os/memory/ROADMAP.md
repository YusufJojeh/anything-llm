# Roadmap [mostly PLANNED / DOCUMENTED_DECISION — see DEFERRED_WORK.md for gate-by-gate scope]

## Near-term

Gate D — governed LocalGit vertical slice. See `CURRENT_GATE.md`.

## Mid-term

Gate E (Engineering + Reviewer agent intelligence actually using LocalGit), Gate F (Command
Center backend projections: `systemStatus`, `agentStatuses`, `taskStatuses`, `approvalQueue`,
`activeHandoffs`, `runProgress`, `adapterHealth`, `costSummary`, `auditSummary` — normalized HTTP
+ SSE, frontend must consume these, never infer truth from agent prose).

## Long-term: the Command Center frontend

`/os` is meant to be a relationship-centric "AI Staff Command Center", not a CRUD dashboard: a
central Yusuf OS / Chief-of-Staff core node surrounded by specialist agent nodes (Engineering,
Reviewer, Memory, Career, Security, Marketing, Sales, Founder, Research, ...) with real
delegation/review/handoff/dependency edges and real status
(`IDLE/RUNNING/WAITING/WAITING_APPROVAL/BLOCKED/ERROR/SCHEDULED/PAUSED/OFFLINE`). Core states:
`HEALTHY/WORKING/WAITING_APPROVAL/WARNING/BLOCKED/SECURITY_ALERT/OFFLINE_ADAPTER`. Must have a
non-graph accessible equivalent (list views, keyboard nav) — the graph is never the only
interface. RTL/Arabic-English, reduced motion, and screen-reader semantics are required, not
optional polish. Planned page set: `/os`, `/os/agents`, `/os/tasks`, `/os/approvals`,
`/os/projects`, `/os/knowledge`, `/os/evidence`, `/os/runs`, `/os/schedules`,
`/os/integrations`, `/os/models`, `/os/cost`, `/os/career`, `/os/marketing`, `/os/founder`,
`/os/settings` — do not scaffold empty routes prematurely; build them when their backing gate
lands.

## Long-term: agent team

Chief of Staff orchestrates; it must not become a "god agent" that does everything itself.
Specialized agents keep separate roles and separate capability policies (per-agent grants in
`yusuf_agent_capabilities`, already modeled in Gate C). Similarly, the security kernel itself
must stay decomposed (Policy / Approval / Execution / Verification / Audit / Tasks / Agents /
Adapters as separate services, as they are today) — resist collapsing them into one service for
convenience.

## Long-term: knowledge architecture

Keep four things distinct rather than collapsing into one vector store: raw Documents/RAG,
structured Knowledge (projects/people/roles/goals/decisions), an Evidence store (claims +
provenance + confidence + visibility), and scoped Memory (personal/project/agent/task/
conversation/temporary — conversation text is not automatically a trusted permanent fact).

## Explicitly not on the roadmap without new architecture

See `DEFERRED_WORK.md` "Explicitly not happening" section.
