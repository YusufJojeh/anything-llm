# Organization Model — Department → Agent → Capability → Job/Workflow → AutonomyLevel

Status: DESIGNED AND IMPLEMENTED, 2026-08-20 (this phase). No prior gate-b doc covered this; it
was previously only a phase name in memory files. This note is the spec that phase implements
against, written before the code per this repo's standing practice for anything touching the
security kernel.

## Problem

Yusuf OS's roster today is three flat, code-owned `AgentDefinition`s
(`chief_of_staff`/`engineering`/`reviewer`) with no grouping above them. The long-term vision
(`docs/yusuf-os/memory/README.md`, the CAVEMAN MODE directive) names many future specialist roles
— Research, Monitoring, Marketing, Career, Founder, Memory Curator. Adding them as flat roles the
way the current three exist would eventually produce an unreadable, ungoverned pile ("no 137 fake
agents" is the standing instruction against this). The organization model exists to give real
future roles a place to attach to *before* they're built, without inventing any of them now.

## What this phase is, and deliberately is not

**Is:** a code-owned grouping layer (`Department`) over the existing `AgentDefinition`s, plus a
per-Agent `AutonomyLevel` label.

**Is not:** a new runtime mechanism. Yusuf OS already has real Job/Workflow primitives —
`yusuf_tasks` (a unit of work), `yusuf_agent_runs` (an attempt at one), `yusuf_handoffs` (an edge
between two runs, i.e. a workflow step). This phase does **not** duplicate them with new "Job" or
"Workflow" tables. It labels the existing task/run/handoff graph with which Department it belongs
to, and leaves the graph itself untouched.

**Is not:** a new specialist Agent. Zero new `AgentDefinition`s are added in this phase. Chief of
Staff, Engineering and Reviewer are grouped into two real Departments that already exist in
substance; a third or fourth Department appears only when a phase actually builds the Agent that
belongs in it, with its own real capabilities — never as an empty placeholder.

## Data model

### `Department` (code-owned, `server/domain/yusufOS/organization/departments.js`)

```
{
  key: string,               // e.g. "system_core"
  name: string,               // display name
  mission: string,
  memberAgentKeys: string[],  // AGENT_KEYS values; must all resolve to a real AgentDefinition
}
```

Frozen, in-code, exactly like `AgentDefinition` — not a database table. A Department is an
organizational fact the codebase asserts, not operational configuration; nothing about who may act
lives here. Every `AgentDefinition` must belong to **exactly one** Department (enforced by a
regression test) — this is what keeps the grouping exhaustive rather than decorative.

Initial departments, both real today:

- `system_core` — Chief of Staff. Orchestration only, matching its zero-capability design.
- `engineering` — Engineering Agent + Reviewer Agent. The one department with an actual delegation
  relationship (`ENGINEERING -> reviewer` handoff) and actual governed capabilities.

### `AutonomyLevel` (code-owned enum, added to each `AgentDefinition`)

```
AUTONOMY_LEVELS = { MANUAL, SUPERVISED, AUTONOMOUS }
```

- `MANUAL` — the Agent only acts when a human or another Agent explicitly delegates one task at a
  time. (Engineering and Reviewer are `MANUAL` today: both require Chief of Staff or a task to
  exist before either does anything.)
- `SUPERVISED` — the Agent may plan and sequence its own sub-steps once given an objective, but
  every side effect still goes through the unchanged Policy/Approval chain. (Chief of Staff is
  `SUPERVISED`: it delegates on its own initiative once given an objective, but it holds no
  capability at all, so "supervised" here only ever means *orchestration* autonomy.)
- `AUTONOMOUS` — reserved for a future Agent that may start work without being handed an objective
  (e.g. a Monitoring Agent reacting to a real signal). **No Agent is `AUTONOMOUS` today** — this
  level exists in the enum so a future phase has a place to put one, not because anything qualifies
  yet.

## The one invariant that matters here

**`AutonomyLevel` and `Department` must never be read by `PolicyEngine`, `ApprovalService`, or any
capability's risk/outcome computation.** Approval requirements are and remain entirely owned by
`server/domain/yusufOS/capabilities/registry.js`'s `defaultRisk`/`defaultOutcome` per capability —
a property of the *action*, not of who's asking or how autonomous they're labelled. This mirrors
the existing fixed vulnerability class this codebase already had to correct once (`CLAUDE.md`:
"Never let a scheduled/unattended job auto-approve an L3+ action"): a label meaning "more
autonomous" must never become a second, softer path to skipping approval. `AutonomyLevel` is
consulted only by `ChiefOfStaff` orchestration logic (does it wait to be told to delegate, or
delegate freely for objectives already assigned to it) and, later, by the Command Center UI to
describe an Agent — never by anything that decides whether an action requires Yusuf's approval.

This is enforced by a regression test that greps `PolicyEngine.js`, `ApprovalService.js`, and
`capabilities/registry.js` for any reference to the organization module or to `autonomyLevel`, and
fails if one appears.

## Non-goals / explicitly deferred

- No new Department beyond the two above. Research/Monitoring/Marketing/Career/Founder/Memory
  Curator departments are created only when the phase that builds their first real Agent runs.
- No Command Center UI change this phase (same pattern as Gate F: backend model first).
- No database migration. Both `Department` and `AutonomyLevel` are code-owned constants layered
  over existing rows; nothing new is persisted.
- No change to `yusuf_tasks`/`yusuf_agent_runs`/`yusuf_handoffs` schemas. A `departmentKey` is
  derived at read time from the task's `assignedAgentId` → `AgentDefinition` → `Department`, not
  stored redundantly.
