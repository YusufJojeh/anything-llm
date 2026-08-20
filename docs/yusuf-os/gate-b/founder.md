# Phase N — Founder

No prior gate-b design doc names this phase beyond the label "Founder" in
`docs/yusuf-os/memory/ROADMAP.md`/`PRODUCT_CHARTER.md`'s future-roster list. This note draws the
shape before code, same discipline as Career and Marketing.

## Problem

`PRODUCT_CHARTER.md` names several side-project ventures Yusuf runs alongside Yusuf OS itself
(CareerGuide AI, HireLens AI, and others). There is no durable place to track which ventures exist,
what stage each is at, or to stop an Agent from silently rewriting that history — e.g. marking a
venture `LAUNCHED` when it was never actually built.

## What this phase is

A real Founder Agent that can record a new venture and move it through an honest, code-owned state
machine — `IDEA -> VALIDATING -> BUILDING -> LAUNCHED`, with `PAUSED` as a resumable side-track and
`KILLED` as a terminal off-ramp from any non-terminal state. Every write is governed the same way
Career/Marketing/Knowledge/Monitoring are: through the full boundary, verified, audited.

## What this phase is not

- **Not investment tracking, revenue, or financial modeling.** Founder tracks venture pipeline
  state only, not money. That would be a distinct future Finance phase.
- **Not incorporation, legal, or business-registration automation.** Out of scope entirely.
- **Not a new UI surface.** Backend first, same as every prior phase.

## New capabilities

Three, in the same internal-Prisma-write-as-external-effect pattern as Career/Marketing:

- **`founder.read_ventures`** (READ, L0, ALLOW) — by `uuid` or `status`.
- **`founder.record_venture`** (LOCAL_WRITE, L1, ALLOW) — creates a new venture. The model supplies
  `name`/`category`/optional `notes`; the server always mints the `uuid` and always starts the row
  at `IDEA`, regardless of what status the model asks for (test-proven, same discipline as
  Career/Marketing).
- **`founder.update_status`** (LOCAL_WRITE, L1, ALLOW) — transitions an existing venture. Validated
  against a code-owned transition table (`domain/yusufOS/founder/transitions.js`) at two points:
  the request builder rejects an illegal transition early using a fresh read, and the adapter
  re-validates against the row it actually reads at execute time (the same defense-in-depth
  placement as Career/Marketing's transition rechecks).

## The transition table

```
IDEA        -> VALIDATING, KILLED
VALIDATING  -> BUILDING, PAUSED, KILLED
BUILDING    -> LAUNCHED, PAUSED, KILLED
LAUNCHED    -> PAUSED, KILLED
PAUSED      -> BUILDING, KILLED
KILLED      -> (terminal)
```

### Why one backward edge

`PAUSED -> BUILDING` is the one backward edge: pausing a venture (funding gap, Yusuf's attention
elsewhere) is explicitly meant to be resumable, unlike Career's terminal `REJECTED`/`WITHDRAWN` or
Marketing's `ARCHIVED`. `LAUNCHED` has no backward edge — once shipped, going back to `BUILDING`
is a new decision that should read `PAUSED -> BUILDING` after an explicit pause, not a silent
un-launch. `KILLED` is the only true terminal state; re-attempting a killed venture is a **new**
`founder.record_venture` row, not a reopened one, mirroring Career's "no reopening" reasoning.

## New Department, new Agent

- **Department:** `founder` (`DEPARTMENT_KEYS.FOUNDER`), one member.
- **Agent:** `founder` (`AGENT_KEYS.FOUNDER`). `allowedCapabilities`: `founder.read_ventures`,
  `founder.record_venture`, `founder.update_status`, `knowledge.read`, `knowledge.write`. No
  `project.*`, `git.*`, `browser.*`, `memory.write`, `monitoring.*`, `career.*`, or `marketing.*`.
  `autonomyLevel: MANUAL`.

## Risk levels

All new capabilities are `ALLOW`, no approval:

| Capability | operationClass | defaultRisk | defaultOutcome |
|---|---|---|---|
| `founder.read_ventures` | READ | L0 | ALLOW |
| `founder.record_venture` | LOCAL_WRITE | L1 | ALLOW |
| `founder.update_status` | LOCAL_WRITE | L1 | ALLOW |

## Known limitations (accepted this phase, not fixed)

- **No financial tracking** — deliberately deferred to a future Finance phase.
- **No retention** on `yusuf_founder_ventures` — same accepted gap as every prior phase.
- **No Command Center UI surfacing** — backend-only this phase.
- **`reconcile()` is narrower than Knowledge/Memory's** — same accepted narrowing as Career's and
  Marketing's `reconcile()`, since `founder.update_status`'s `canonicalPayload` carries only
  `notes`, not the full row.

## Non-goals (explicitly deferred)

- Investment/revenue/financial modeling (a future Finance phase's decision).
- Legal/incorporation automation.
- Command Center UI surfacing of ventures.
