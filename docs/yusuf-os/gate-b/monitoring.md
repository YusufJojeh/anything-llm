# Phase K — Monitoring

No prior gate-b design doc names this phase beyond the label "Monitoring" in
`docs/yusuf-os/memory/README.md`/`DEFERRED_WORK.md` and the future-roster list in
`PRODUCT_CHARTER.md` ("Research, **Monitoring**, Marketing, Career..."). This note draws the shape
before any code, same discipline as the Organization model and Phase J.

## Problem

Yusuf OS can already tell you its own state on demand (`DashboardProjection`, Gate F). Nothing
*watches* that state and says something when it degrades. The Organization model's own text names
the gap directly: `AUTONOMY_LEVELS.AUTONOMOUS` was added "for a future Agent that may start work
without being handed an objective (e.g. a Monitoring Agent reacting to a real signal)" — and then
deliberately left unused, because nothing yet justified it.

## What this phase is

A real Monitoring Agent that can read Yusuf OS's own internal health signals, judge them against
code-owned thresholds, and durably record what it found — first as a structured check-history row,
and, when something is actually wrong, as a Knowledge finding. This is the first Agent to actually
receive `AUTONOMY_LEVELS.AUTONOMOUS`, and the first phase to test what that label should mean in
practice for capability grants.

## What this phase is not

- **Not real autonomous scheduling.** The Agent still only runs when handed a Task, exactly like
  Engineering and Reviewer today. `AUTONOMOUS` here describes *what it's for* (a future Agent that
  reacts on its own once wired to a trigger), not a scheduler this phase builds. Wiring an actual
  unattended trigger is a separate, later decision — the same "mechanism built, trigger not wired"
  shape Phase J left `EvidenceRetention.tombstoneExpiredEvidence` in.
- **Not external monitoring** (competitor sites, prices, news). That is Research's territory, not
  Monitoring's, and needs the Browser Broker (Phase H/I) wired to a real allowlisted origin first.
  This phase watches Yusuf OS's *own* internal state only.
- **Not a new UI surface.** Same pattern as Gate F and the Organization model: backend first.

## A self-observation hazard, caught by independent review

The snapshot is read from inside a governed capability call, so the intent for *that very call*
is itself still `EXECUTING` at the moment the snapshot query runs (the framework marks it
`EXECUTING` before calling the adapter). Left uncorrected, a `system.read_health`/
`monitoring.record_check` call would always see at least one "unresolved" intent — itself.

The first fix attempted was too broad: excluding the whole `monitoring.record_check` capability
from the `unresolvedIntents` count. Independent review caught that this is wrong — a
`monitoring.record_check` write can genuinely get stuck `EXECUTING`/`FAILED_UNKNOWN` (a DB error
after the row commits but before verification, a crash mid-call), which is exactly the class of
unproven effect this signal exists to surface, and a capability-wide exclusion would hide it
forever. `system.read_health` really can be excluded wholesale — it persists nothing, so it can
never be a stuck effect. The corrected fix (`readSystemHealthSnapshot(db, { excludeIntentId })`)
excludes only the exact intent id computing the current snapshot; a stuck `monitoring.record_check`
intent from any *other* call still counts. See the regression test in `monitoringLifecycle.test.js`
that manufactures a stuck prior intent and asserts a later check still reports it.

## What it watches, and how

`monitoring/thresholds.js` exports `evaluateSystemHealth(snapshot)` — a pure function, no I/O — and
a single code-owned check today, `SYSTEM_HEALTH`:

| Signal | Source | WARN | BREACH |
|---|---|---|---|
| Pending approvals | `yusuf_approval_requests` where `PENDING` | ≥ 5 | ≥ 20 |
| Unresolved intents (a real effect may have happened and is unproven either way — the same set `DashboardProjection#systemStatus` already counts) | `yusuf_action_intents` in `EXECUTING`/`EXECUTED_UNVERIFIED`/`FAILED_UNKNOWN` | ≥ 1 | ≥ 5 |
| Control-plane health | `auditKeyConfigured()` | — | `DEGRADED` |
| Emergency stop | `yusuf_security_settings` kill switch | engaged | — |

The worst signal wins. Deliberately a small, fixed table, not a config surface — a new signal is
added by a future phase editing this file under review, the same trust level as every other
code-owned security constant in this project.

## New capabilities

Two, in the same pattern established by Phase H (`system.*`, read) and Phase J (`monitoring.*`,
a Prisma-write-as-external-effect adapter):

- **`system.read_health`** (READ, L0, ALLOW) — returns the current snapshot (the four raw signals
  above) with no interpretation. `SystemHealthAdapter` reads directly from Prisma; it never spawns
  a subprocess (unlike `DashboardProjection#adapterHealth`, which is deliberately not reused here).
- **`monitoring.record_check`** (LOCAL_WRITE, L1, ALLOW) — the model supplies only a `checkKey`
  (currently only `SYSTEM_HEALTH` is registered). The adapter — not the model — recomputes the
  snapshot fresh at execute time and runs `evaluateSystemHealth`, then persists the server-derived
  `status`/`observedValue`/`threshold`/`summary` to the new `yusuf_monitoring_checks` table. This
  mirrors `recordEvidence`'s `VALIDATION`-kind evidence: the one field that could gate anything
  (`status`) is never a caller's claim, it is derived from server-owned state. A model cannot get a
  false "OK" recorded by lying about its own arguments.

Both are true creates (`yusuf_monitoring_checks` is an append-only check history, like Knowledge),
described the same way Phase J described `knowledge.write`: idempotency `SERVER_KEY`, and running
the same check twice on purpose is expected to add two history rows, not merge them — that is what
a history is for.

Filing a durable **finding** when a check comes back WARN/BREACH is a second, separate step the
Agent takes deliberately by calling `knowledge.write` (already governed, already grantable) with
`sourceType: AGENT_DERIVED` — `monitoring.record_check` does not chain a second capability call
internally. Two governed writes, two audit events, one per actual effect; no capability silently
causes a second one on the Agent's behalf.

## New Department, new Agent, new invariant

- **Department:** `monitoring` (`DEPARTMENT_KEYS.MONITORING`), one member.
- **Agent:** `monitoring` (`AGENT_KEYS.MONITORING`). `allowedCapabilities`: `system.read_health`,
  `monitoring.record_check`, `knowledge.read`, `knowledge.write`. No `project.*`, `git.*`,
  `browser.*`, or `memory.write` — it can observe Yusuf OS's own state and file a note about it,
  and nothing else. `autonomyLevel: AUTONOMOUS` — the first real use of the label.

Granting `AUTONOMOUS` to an Agent whose only capabilities are two L0/L1 internal-effect
capabilities is a deliberately conservative first use. But labels drift, and this project has
already been burned once by a label that quietly became a second path around approval (the
scheduled-job auto-approve bug, `GATE_HISTORY.md`). So this phase adds a second, equally
structural invariant next to the Organization model's grep-based one:

> **No `AUTONOMOUS`-level Agent may ever be defined with a capability whose `defaultRisk` is above
> `L1`, or whose `operationClass` is `EXTERNAL_MUTATION`.**

Enforced by a `test.each` over every `AgentDefinition`: for any agent with `autonomyLevel ===
AUTONOMOUS`, every capability in its `allowedCapabilities` is looked up in the capability registry
and asserted `L0`/`L1` and not `EXTERNAL_MUTATION`. This is a structural ceiling on what
"autonomous" can ever mean in this codebase without a human first weakening a test, not a
convention future code has to remember. If Monitoring — or any future `AUTONOMOUS` Agent — is ever
given a capability like `browser.submit_form` or `git.push_feature_branch`, this test fails before
the grant can be seeded.

## Risk levels

All new capabilities are `ALLOW`, no approval:

| Capability | operationClass | defaultRisk | defaultOutcome |
|---|---|---|---|
| `system.read_health` | READ | L0 | ALLOW |
| `monitoring.record_check` | LOCAL_WRITE | L1 | ALLOW |

Nothing here introduces `REQUIRE_APPROVAL` or `FORBIDDEN`.

## Known limitations (accepted this phase, not fixed)

- **No scheduled trigger.** Monitoring only runs when handed a Task, same as every other Agent.
  Wiring `run-scheduled-job.js` to actually create Monitoring runs unattended is a real design
  decision (concurrency, backoff, what happens if a check itself throws) deferred to a later phase
  — see `docs/yusuf-os/memory/DEFERRED_WORK.md`. Building it now, before this phase's capabilities
  and invariant have been reviewed, would be exactly the kind of premature scope CLAUDE.md warns
  against.
- **One check today.** `SYSTEM_HEALTH` is the only registered `checkKey`. Adding a second is a
  small, low-risk change (extend `thresholds.js` + the request builder's allowlist) deliberately
  left for whenever a real second signal exists to watch — no speculative check keys are seeded.
- **No retention on `yusuf_monitoring_checks`.** Same accepted gap Phase J left on Knowledge/Memory;
  documented once there, not re-litigated here.

## Non-goals (explicitly deferred)

- Any external (browser/API) monitoring signal.
- A scheduled/unattended trigger for Monitoring runs.
- Command Center UI surfacing of check history.
- A second `AUTONOMOUS` Agent — this phase proves the invariant holds for one.
