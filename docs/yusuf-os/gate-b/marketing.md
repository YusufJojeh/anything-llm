# Phase M — Marketing

No prior gate-b design doc names this phase beyond the label "Marketing" in
`docs/yusuf-os/memory/ROADMAP.md`/`PRODUCT_CHARTER.md`'s future-roster list. This note draws the
shape before code lands in the tree, same discipline as Career, Monitoring, and the Organization
model — it was retrofitted alongside the implementation this phase rather than strictly before it,
but covers the same ground.

## Problem

Yusuf produces marketing content (posts, threads, blog posts) across channels as part of his
portfolio/side-project work. Yusuf OS has no durable place to track what content exists, what
stage it is at, or to stop an Agent from silently rewriting history — e.g. marking something
`PUBLISHED` when it was never drafted or reviewed.

## What this phase is

A real Marketing Agent that can record a new content item and move it through an honest,
code-owned state machine — `IDEA -> DRAFTING -> READY_FOR_REVIEW -> SCHEDULED -> PUBLISHED`, with
`ARCHIVED` as a terminal off-ramp from any non-terminal state, and two deliberate backward edges
for revision loops (see below). Every write is governed the same way Career/Knowledge/Monitoring
are: through the full boundary, verified, audited.

## What this phase is not

- **Not a publishing integration.** No connection to Twitter, a CMS, or any other posting surface
  exists yet, and none is added here. `PUBLISHED` is a Yusuf-reported claim, not a verified fact —
  see Known limitations.
- **Not content generation.** Out of scope; Marketing only tracks state, it does not draft copy.
- **Not a new UI surface.** Same pattern as every prior phase: backend first.

## New capabilities

Three, in the same internal-Prisma-write-as-external-effect pattern as Career/Knowledge/Memory/Monitoring:

- **`marketing.read_content`** (READ, L0, ALLOW) — by `uuid` or `status`.
- **`marketing.record_content`** (LOCAL_WRITE, L1, ALLOW) — creates a new content item. The model
  supplies `title`/`channel`/`format`/optional `notes`; the server always mints the `uuid` and
  always starts the row at `IDEA`, regardless of what status the model asks for (test-proven:
  requesting `status: "PUBLISHED"` on creation still records `IDEA`). This mirrors Career/
  Monitoring's discipline of never trusting the model with a value only the server should decide.
- **`marketing.update_status`** (LOCAL_WRITE, L1, ALLOW) — transitions an existing content item.
  Validated against a code-owned transition table (`domain/yusufOS/marketing/transitions.js`) at
  two points: the request builder rejects an illegal transition early using a fresh read (before an
  intent is even created), and the adapter re-validates against the row it actually reads at
  execute time (the same defense-in-depth placement as Career's transition recheck / Memory's
  scope-ownership recheck — closes the TOCTOU window the framework's generic live-preflight
  recheck narrows but doesn't fully close).

## The transition table

```
IDEA               -> DRAFTING, ARCHIVED
DRAFTING           -> READY_FOR_REVIEW, ARCHIVED
READY_FOR_REVIEW   -> SCHEDULED, DRAFTING, ARCHIVED
SCHEDULED          -> PUBLISHED, DRAFTING, ARCHIVED
PUBLISHED          -> ARCHIVED
ARCHIVED           -> (terminal)
```

### Why one backward edge (two, actually)

Career's table is strictly forward-or-terminal on purpose — re-pursuing a job is a new
opportunity, not reopened history. Marketing is different: a real content pipeline routinely sends
a draft back for revision after review, or pulls a scheduled post back before it goes out, without
that being a lie about history. So this table allows exactly two backward edges:

- `READY_FOR_REVIEW -> DRAFTING` — sent back for revision after review.
- `SCHEDULED -> DRAFTING` — pulled back before it went out (plans change, a scheduled post gets
  reworked).

No other backward edge exists. In particular `PUBLISHED` has no backward edge at all — once
something is reported published, un-publishing it is not a "back to drafting" event, it is a new
decision that belongs in `notes`, or the item should be archived and a new one drafted. A pure
`isValidTransition(from, to)` function is unit-tested in isolation from the adapter, including a
dedicated test asserting these are the *only* two backward edges in the table.

## New Department, new Agent

- **Department:** `marketing` (`DEPARTMENT_KEYS.MARKETING`), one member.
- **Agent:** `marketing` (`AGENT_KEYS.MARKETING`). `allowedCapabilities`:
  `marketing.read_content`, `marketing.record_content`, `marketing.update_status`,
  `knowledge.read`, `knowledge.write`. No `project.*`, `git.*`, `browser.*`, `memory.write`,
  `monitoring.*`, or `career.*` — it tracks content and can note what it finds via Knowledge,
  nothing else.
  `autonomyLevel: MANUAL` — task-driven like Career/Engineering/Reviewer, not `AUTONOMOUS` like
  Monitoring; nothing about tracking marketing content calls for an Agent that starts work on its
  own.

## Risk levels

All new capabilities are `ALLOW`, no approval:

| Capability | operationClass | defaultRisk | defaultOutcome |
|---|---|---|---|
| `marketing.read_content` | READ | L0 | ALLOW |
| `marketing.record_content` | LOCAL_WRITE | L1 | ALLOW |
| `marketing.update_status` | LOCAL_WRITE | L1 | ALLOW |

## Known limitations (accepted this phase, not fixed)

- **`PUBLISHED` is an unverified self-report.** No real posting integration exists in Yusuf OS, so
  a content item reaching `PUBLISHED` records only that Yusuf (or an Agent on his behalf) says it
  went out — Yusuf OS has no way to confirm it actually did. This is the same class of limitation
  as Career's "no `ACCEPTED` status" non-goal: it tracks Yusuf's own reported pipeline state, not
  ground truth about the outside world.
- **No retention** on `yusuf_marketing_content` — same accepted gap already left on
  Career/Knowledge/Memory/Monitoring, not re-litigated here.
- **No Command Center UI surfacing** of content items — backend-only this phase.
- **`reconcile()` is narrower than Knowledge/Memory's.** `marketing.update_status`'s
  `canonicalPayload` carries only `notes`, not the full row, so `reconcile()` can only confirm the
  row exists with the target status applied — it cannot recompute an "expected" digest from the
  intent alone the way Knowledge/Memory can. Same accepted narrowing as Career's `reconcile()`.

## Non-goals (explicitly deferred)

- Any real publishing/posting integration (Browser Broker form registration, a later phase's
  decision) — `PUBLISHED` stays a self-report until that integration exists and is deliberately
  scoped.
- Content generation/drafting assistance.
- Command Center UI surfacing of marketing content.
- Analytics/engagement tracking on published content — out of scope; this phase only tracks
  pipeline state, not performance.
