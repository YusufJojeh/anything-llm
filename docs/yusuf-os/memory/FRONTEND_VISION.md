# Frontend Vision [APPROVED PRODUCT DIRECTION — first slice implemented in Gate G]

> **Status as of 2026-08-18.** Gate G implemented the first slice of everything below at `/os`.
> The principles in this file are **not superseded by the implementation** — they are the
> acceptance criteria every future `/os` change is still measured against. What exists today:
>
> - Central Yusuf OS core with a semantic state derived only from asserted values, agent nodes
>   from the real roster, and edges drawn **only** from persisted `yusuf_handoffs` rows.
> - Attention Queue ("needs Yusuf"), agent detail, task/run drilldown, approval review with the
>   full lifecycle, and System Health from the Gate F projection.
> - The synchronized `AgentRoster` list as a genuinely equal non-graph path, not a fallback.
> - English + Arabic with real RTL, reduced-motion support, and a dark operational token layer.
> - Routes: `/os`, `/os/agents`, `/os/tasks[/:id]`, `/os/approvals[/:id]`, `/os/runs[/:id]`,
>   `/os/projects`, `/os/system`. The rest of the route list below is still deferred.
>
> **Gate G.1 (2026-08-18)** then raised the visual fidelity: the core is 26% more dominant, orbit
> radius adapts to roster size so a three-Agent staff reads as deliberate rather than empty, Agents
> carry code-owned role glyphs and status halos, relationship edges are distinguishable by their
> persisted reason, and the navigation rail was reduced to a 57px utility so the constellation is
> unambiguously the product.
>
> **2026-09-29 redesign:** `/os` became a single "Jarvis" mission console (telemetry strip,
> Agent rail, dominant System Core with support panels and stage rail, communication console,
> bottom nav). The constellation component is retained in the tree but the Core now carries the
> orbit (real roster only) and real handoff edges. All principles above still apply; host metrics
> without a backend source are shown as NOT REPORTED.
>
> See `GATE_HISTORY.md` (Gates G and G.1) for the record and `KNOWN_RISKS.md` for what was not proven.

Gate E deliberately implemented **no frontend**. This file exists so the approved product
direction survives the backend-first gates and is not later replaced by a generic dashboard.

## The primary experience is an AI Staff Command Center

`/os` is not a CRUD admin panel with a sidebar. It is a living command center:

```
                  Research
                     ○
        Reviewer ○       ○ Memory
Engineering ○        ◎        ○ Career
                 YUSUF OS
              CHIEF OF STAFF
     Security ○             ○ Marketing
             Sales ○   ○ Founder
```

- **Center**: Yusuf OS core / Chief of Staff, showing real system state
  (`HEALTHY`, `WORKING`, `WAITING_APPROVAL`, `WARNING`, `BLOCKED`, `SECURITY_ALERT`,
  `OFFLINE_ADAPTER`).
- **Nodes**: specialist Agents with real status (`IDLE`, `RUNNING`, `WAITING`,
  `WAITING_APPROVAL`, `BLOCKED`, `ERROR`, `SCHEDULED`, `PAUSED`, `OFFLINE`).
- **Edges**: real delegation, handoff, review, dependency, and escalation relationships.

## Non-negotiables

- **No fake data.** Every node, edge, count, and status must come from a normalized backend
  projection. No decorative animation implying activity that isn't happening, no invented
  metrics. If the backend can't prove it, the UI doesn't show it.
- **Approvals are first-class**, not buried in a settings screen — "what is waiting for Yusuf"
  is a primary surface.
- **Operational tables are secondary** views, not the main experience.
- **The graph is never the only interface.** An equivalent accessible experience is required:
  agent list, task list, full keyboard navigation, semantic status text (not color alone),
  accessible approval flows, and screen-reader-friendly announcements of async state changes.
- **Arabic + English with full RTL**, logical properties, and correct bidi handling.
- **Reduced-motion** support is required, not optional.
- **Desktop-first**, with a genuine responsive fallback rather than a broken shrink.
- **Premium dark technical visual language** — this is Yusuf's personal operations console.

## The data contract already exists in the backend

Gate E leaves the state a Command Center needs already persisted and queryable. See
`ChiefOfStaff.taskState()` in `server/domain/yusufOS/orchestration/ChiefOfStaff.js`, which
returns exactly the shape a future UI renders: task status and owner, per-agent run status and
failure kind, real handoff edges (from/to/reason/status), full review history with verdicts, a
count of waiting approvals, and the deterministic completion assessment with its blockers.

Backing tables: `yusuf_handoffs` (edges), `yusuf_review_verdicts` (verdict history),
`yusuf_run_evidence` (what was actually proven), `yusuf_agent_runs` (per-agent status +
`failureKind`), plus Gate C's intents/approvals/receipts/audit.

**Rule for whoever builds this:** the frontend consumes normalized backend projections. It never
infers truth from Agent prose, and it never computes a status the backend didn't assert.

## Planned routes (do not scaffold empty ones early)

*Implemented in Gate G:* `/os`, `/os/agents`, `/os/tasks`, `/os/approvals`, `/os/projects`,
`/os/runs`, `/os/system`. The remainder below are still deferred until their backing gate lands.

`/os`, `/os/agents`, `/os/tasks`, `/os/approvals`, `/os/projects`, `/os/knowledge`,
`/os/evidence`, `/os/runs`, `/os/schedules`, `/os/integrations`, `/os/models`, `/os/cost`,
`/os/career`, `/os/marketing`, `/os/founder`, `/os/settings`.

Build each when its backing gate lands. See `DEFERRED_WORK.md` (Gate F = backend projections,
Gate G = Command Center frontend).

## Skills to load when frontend work actually starts

`anthropic-skills:agentic-ux-design-relationship-centric-interfaces` (the core differentiator:
showing who delegated to whom, who reviews whom, what's waiting, why something is blocked),
plus `frontend-architecture`, `frontend-accessibility`, `internationalization-rtl`,
`responsive-ui-engineer`, `realtime-engineer`, `state-data-flow-engineer`. See
`SKILLS_INVENTORY.md`.
