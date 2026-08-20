# Phase O — Research

No prior gate-b design doc names this phase beyond the label "Research" in
`docs/yusuf-os/memory/ROADMAP.md`/`PRODUCT_CHARTER.md`'s future-roster list. This note draws the
shape before code, same discipline as Career/Marketing/Founder.

## Problem

Yusuf regularly investigates open questions (technical, market, competitive) as part of running
Yusuf OS and its side ventures. There is no durable place to track what questions are open, which
are actively being investigated, and what was concluded — and nothing stops an Agent from silently
rewriting a conclusion without it being an honest re-investigation.

## What this phase is

A real Research Agent that can record a new research question and move it through an honest,
code-owned state machine — `OPEN -> INVESTIGATING -> ANSWERED`, with `ABANDONED` as a terminal
off-ramp from any non-terminal state, and a deliberate reopening edge (`ANSWERED -> INVESTIGATING`)
for when new information invalidates a prior conclusion. Every write is governed the same way
Career/Marketing/Founder are: through the full boundary, verified, audited.

## What this phase is not

- **Not automated web research or search.** No browsing/search-execution capability is added here;
  an Agent records what it (or Yusuf) has found, it doesn't go fetch it. Real automated research
  would need the Browser Broker plus a real search integration — deferred.
- **Not a knowledge base.** `knowledge.*` (Phase J) already exists for durable sourced facts;
  Research tracks the *question's pipeline state*, and a Research Agent may separately file findings
  into Knowledge once its own capabilities let it (already granted, see below).
- **Not a new UI surface.** Backend first, same as every prior phase.

## New capabilities

Three, in the same internal-Prisma-write-as-external-effect pattern as Career/Marketing/Founder:

- **`research.read_items`** (READ, L0, ALLOW) — by `uuid` or `status`.
- **`research.record_item`** (LOCAL_WRITE, L1, ALLOW) — creates a new research question. The model
  supplies `question`/`category`/optional `notes`; the server always mints the `uuid` and always
  starts the row at `OPEN`, regardless of what status the model asks for (test-proven, same
  discipline as every prior tracking phase).
- **`research.update_status`** (LOCAL_WRITE, L1, ALLOW) — transitions an existing item. Validated
  against a code-owned transition table (`domain/yusufOS/research/transitions.js`) at two points:
  the request builder rejects an illegal transition early using a fresh read, and the adapter
  re-validates against the row it actually reads at execute time (the same defense-in-depth
  placement as every prior tracking phase's transition recheck).

## The transition table

```
OPEN           -> INVESTIGATING, ABANDONED
INVESTIGATING  -> ANSWERED, ABANDONED
ANSWERED       -> INVESTIGATING, ABANDONED
ABANDONED      -> (terminal)
```

### Why the reopening edge

`ANSWERED -> INVESTIGATING` is the one backward edge: unlike Career's terminal rejection/withdrawal
or Founder's paused-venture resume, a research conclusion can be *wrong*, and new evidence
surfacing later should be able to reopen the question honestly rather than forcing a brand-new row
that loses the history of the prior investigation. This is different in kind from Marketing's
`READY_FOR_REVIEW -> DRAFTING`/`SCHEDULED -> DRAFTING` (routine pipeline revision) and from
Founder's `PAUSED -> BUILDING` (resuming paused work) — here the backward edge exists specifically
because a *concluded* state can later prove incorrect. `ABANDONED` remains the only true terminal
state: an abandoned question that becomes relevant again is a **new** `research.record_item` call,
mirroring every prior tracking phase's "no reopening a dead-end" reasoning.

## New Department, new Agent

- **Department:** `research` (`DEPARTMENT_KEYS.RESEARCH`), one member.
- **Agent:** `research` (`AGENT_KEYS.RESEARCH`). `allowedCapabilities`: `research.read_items`,
  `research.record_item`, `research.update_status`, `knowledge.read`, `knowledge.write`. No
  `project.*`, `git.*`, `browser.*`, `memory.write`, `monitoring.*`, `career.*`, `marketing.*`, or
  `founder.*`. `autonomyLevel: MANUAL`.

## Risk levels

All new capabilities are `ALLOW`, no approval:

| Capability | operationClass | defaultRisk | defaultOutcome |
|---|---|---|---|
| `research.read_items` | READ | L0 | ALLOW |
| `research.record_item` | LOCAL_WRITE | L1 | ALLOW |
| `research.update_status` | LOCAL_WRITE | L1 | ALLOW |

## Known limitations (accepted this phase, not fixed)

- **No automated research execution** — a Research Agent records state, it doesn't browse or
  search; that needs the Browser Broker plus a real search integration, deferred.
- **No retention** on `yusuf_research_items` — same accepted gap as every prior tracking phase.
- **No Command Center UI surfacing** — backend-only this phase.
- **`reconcile()` is narrower than Knowledge/Memory's** — same accepted narrowing as
  Career/Marketing/Founder's `reconcile()`, since `research.update_status`'s `canonicalPayload`
  carries only `notes`, not the full row.

## Non-goals (explicitly deferred)

- Automated web research/search integration.
- Command Center UI surfacing of research items.
- Any structured "citation"/source-linking beyond what `knowledge.*` already provides.
