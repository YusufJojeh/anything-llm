# Phase L — Career

No prior gate-b design doc names this phase beyond the label "Career" in
`docs/yusuf-os/memory/ROADMAP.md`/`PRODUCT_CHARTER.md`'s future-roster list. This note draws the
shape before any code, same discipline as Monitoring, the Organization model, and Phase J.

## Problem

Yusuf's own portfolio context (`PRODUCT_CHARTER.md`) names several career-adjacent side projects
(CareerGuide AI, HireLens AI). Yusuf OS itself has no durable place to track a job opportunity
Yusuf is actually pursuing — no structured record of what stage each one is at, and nothing that
stops an Agent (or a careless later change) from silently rewriting history, e.g. recording an
opportunity as `OFFER` when it was never `APPLIED`.

## What this phase is

A real Career Agent that can record a new opportunity and move it through an honest, code-owned
state machine — `RESEARCHING -> APPLIED -> INTERVIEWING -> OFFER`, with `REJECTED`/`WITHDRAWN` as
terminal off-ramps from any non-terminal state. Every write is governed the same way Knowledge and
Monitoring are: through the full boundary, verified, audited.

## What this phase is not

- **Not job-board scraping or auto-apply.** No integration with LinkedIn, Indeed, or any job
  board exists yet, and none is added here. That needs the Browser Broker plus a real per-service
  form registration (Phase I's own pattern) — a much larger, separate decision this phase does not
  make.
- **Not resume/cover-letter generation.** Out of scope; Career only tracks state, it does not
  produce artifacts.
- **Not a new UI surface.** Same pattern as every prior phase: backend first.

## New capabilities

Three, in the same internal-Prisma-write-as-external-effect pattern as Knowledge/Memory/Monitoring:

- **`career.read_opportunities`** (READ, L0, ALLOW) — by `uuid` or `status`.
- **`career.record_opportunity`** (LOCAL_WRITE, L1, ALLOW) — creates a new opportunity. The model
  supplies `company`/`role`/optional `source`/`notes`; the server always mints the `uuid` and
  always starts the row at `RESEARCHING`, regardless of what status the model asks for (test-proven:
  requesting `status: "OFFER"` on creation still records `RESEARCHING`). This mirrors Monitoring's
  own discipline of never trusting the model with a value only the server should decide.
- **`career.update_status`** (LOCAL_WRITE, L1, ALLOW) — transitions an existing opportunity.
  Validated against a code-owned transition table
  (`domain/yusufOS/career/transitions.js`) at two points: the request builder rejects an illegal
  transition early using a fresh read (before an intent is even created, mirroring Monitoring's
  early rejection of an unregistered `checkKey`), and the adapter re-validates against the row it
  actually reads at execute time (the same defense-in-depth placement as Memory's scope-ownership
  recheck — the framework's generic live-preflight recheck narrows the window between builder and
  execute, this closes it).

## The transition table

```
RESEARCHING   -> APPLIED, WITHDRAWN
APPLIED       -> INTERVIEWING, REJECTED, WITHDRAWN
INTERVIEWING  -> OFFER, REJECTED, WITHDRAWN
OFFER         -> REJECTED, WITHDRAWN
REJECTED      -> (terminal)
WITHDRAWN     -> (terminal)
```

`REJECTED`/`WITHDRAWN` are dead ends on purpose: re-pursuing the same company/role later is a
**new** opportunity row (a fresh `career.record_opportunity` call), not a reopened old one, so
history is never silently rewritten. A pure `isValidTransition(from, to)` function is unit-tested
in isolation from the adapter, same discipline as `monitoring/thresholds.js`.

## New Department, new Agent

- **Department:** `career` (`DEPARTMENT_KEYS.CAREER`), one member.
- **Agent:** `career` (`AGENT_KEYS.CAREER`). `allowedCapabilities`: `career.read_opportunities`,
  `career.record_opportunity`, `career.update_status`, `knowledge.read`, `knowledge.write`. No
  `project.*`, `git.*`, `browser.*`, `memory.write`, or `monitoring.*` — it tracks opportunities and
  can note what it finds via Knowledge, nothing else.
  `autonomyLevel: MANUAL` — task-driven like Engineering/Reviewer, not `AUTONOMOUS` like Monitoring;
  nothing about tracking a job search calls for an Agent that starts work on its own.

## Risk levels

All new capabilities are `ALLOW`, no approval:

| Capability | operationClass | defaultRisk | defaultOutcome |
|---|---|---|---|
| `career.read_opportunities` | READ | L0 | ALLOW |
| `career.record_opportunity` | LOCAL_WRITE | L1 | ALLOW |
| `career.update_status` | LOCAL_WRITE | L1 | ALLOW |

## Known limitations (accepted this phase, not fixed)

- **No retention** on `yusuf_career_opportunities` — same accepted gap already left on
  Knowledge/Memory/Monitoring, not re-litigated here.
- **No Command Center UI surfacing** of opportunities — backend-only this phase.
- **`reconcile()` is narrower than Knowledge/Memory's.** `career.update_status`'s
  `canonicalPayload` carries only `notes`, not the full row, so `reconcile()` can only confirm the
  row exists with the target status applied — it cannot recompute an "expected" digest from the
  intent alone the way Knowledge/Memory can. Documented, not silently understated.

## Non-goals (explicitly deferred)

- Any job-board or email integration (Browser Broker form registration, a later phase's decision).
- Resume/cover-letter generation.
- Command Center UI surfacing of career opportunities.
- An `ACCEPTED` terminal status distinct from the real-world act of accepting an offer — that act
  is outside Yusuf OS entirely; this phase only tracks Yusuf's own pipeline state.
