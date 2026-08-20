# Deferred Work

## Deferred after Phase L (Career) — 2026-08-20

Phase L is **done** — see `CURRENT_GATE.md`. Still deferred:

- **Any job-board or email integration.** No LinkedIn/Indeed/Gmail wiring exists; Career only
  tracks opportunities a human or Agent tells it about. Real integration needs the Browser Broker
  plus a per-service form registration (Phase I's own pattern), a separate, larger decision.
- **Resume/cover-letter generation** — out of scope; Career tracks state, it does not produce
  artifacts.
- **No retention on `yusuf_career_opportunities`** — same accepted gap already left on Knowledge/
  Memory/Monitoring, not re-litigated here.
- **No Command Center UI surfacing** of career opportunities — backend-only this phase.
- **Notes cannot be cleared via `career.update_status`**, only replaced with new text — intentional
  (documented with a code comment after independent review flagged it as worth noting), not a bug.
- **Everything after Career in the CAVEMAN MODE order** — Marketing, Founder, Research, Sales/
  Inbox, Integrations, Model routing/cost, Command Center expansion, security/reliability
  hardening, release/ops, end-to-end scenarios — not started.

## Deferred after Phase K (Monitoring) — 2026-08-20

Phase K is **done** — see `CURRENT_GATE.md`. Still deferred:

- **A scheduled/unattended trigger for Monitoring runs.** Monitoring only runs when handed a Task,
  same as every other Agent today. Wiring `run-scheduled-job.js` to create real Monitoring runs
  unattended is a real design decision (concurrency, backoff, what happens if a check itself
  throws) deliberately deferred — building it now would be premature scope.
- **Only one registered `checkKey`** (`SYSTEM_HEALTH`). A second check is a small, low-risk
  addition (extend `thresholds.js` + the request builder's allowlist) left for whenever a real
  second signal exists to watch.
- **No retention on `yusuf_monitoring_checks`** — same accepted gap already left on Knowledge/
  Memory in Phase J, not re-litigated here.
- **No Command Center UI surfacing** of check history — backend-only this phase, same pattern as
  every prior phase.
- **A second `AUTONOMOUS` Agent** — this phase proves the new risk-ceiling invariant holds for one;
  it does not add another.
- **Everything after Monitoring in the CAVEMAN MODE order** — Career, Marketing, Founder, Research,
  Sales/Inbox, Integrations, Model routing/cost, Command Center expansion, security/reliability
  hardening, release/ops, end-to-end scenarios — not started.

## Deferred after Phase J (Knowledge/Evidence/Memory split) — 2026-08-20

Phase J is **done** — see `CURRENT_GATE.md`. Still deferred:

- **Knowledge/Memory retention** — Evidence now has a class-derived `expiresAt` + tombstone
  mechanism; Knowledge and Memory have neither. Accepted as a known limitation in the design note,
  not fixed this phase.
- **A scheduled trigger for `EvidenceRetention.tombstoneExpiredEvidence`** — the function exists and
  is tested; nothing calls it on a schedule yet. A job-runner wiring decision, deferred with
  whichever phase first needs scheduled system-owned jobs generally.
- **Command Center UI surfacing of Knowledge/Memory/Evidence classification** — backend-only this
  phase, same pattern as Gate F and the Organization model.
- **Wider Agent grants** — only Engineering (`knowledge.*`, `memory.*`) and Reviewer
  (`knowledge.read` only) were granted. Chief of Staff was deliberately left with `[]`; any future
  specialist Agent gets Knowledge/Memory grants decided alongside that Agent's own phase.
- **Memory Curator role/Department** — still a name only, per the Organization model's own
  deferred-Department list; Phase J did not build a real Agent for it.
- The pre-existing `preflight()`-failure-orphans-the-intent framework gap (a `preflight()` throw
  isn't caught by `ExecutionCoordinator`'s failure-finalization try/catch) was confirmed to predate
  this phase and affect every capability, not just Knowledge/Memory — documented as an accepted,
  out-of-scope limitation, not "deferred work" to fix without further instruction.
- **Phase K (Monitoring)**, and everything after it in the CAVEMAN MODE order — Career, Marketing,
  Founder, Research, Sales/Inbox, Integrations, Model routing/cost, Command Center expansion,
  security/reliability hardening, release/ops, end-to-end scenarios — not started.

## Deferred after the Organization model — 2026-08-20

The Department/AutonomyLevel organization model is **done** — see `CURRENT_GATE.md`. Still
deferred:

- **A third Department** — Research, Monitoring, Marketing, Career, Founder, Memory Curator all
  remain names only. A Department is added only alongside the phase that builds its first real
  Agent with real capabilities, never as an empty placeholder.
- **Any `AUTONOMOUS`-level Agent** — the enum value exists; nothing qualifies for it yet.
- **Command Center UI surfacing of Department/AutonomyLevel** — backend-only this phase, same
  pattern as Gate F.
- **Phase J (Knowledge/Evidence/Memory split)** — next automatic phase per `CURRENT_GATE.md`.

## Deferred after Phase I — 2026-08-20

Phase I (governed browser mutations, `browser.submit_form`) is **done** — see `CURRENT_GATE.md`.
Still deferred:

- **Granting `browser.submit_form` (or any `browser.*` capability) to an Agent** — deferred with
  the Agent that needs it. No role allowlist contains one today.
- **Registering a real production form in `formRegistry.js`** — the registry ships empty on
  purpose; wiring a real service form (Gmail reply, LinkedIn post, a job application) is a
  per-integration decision that belongs with that integration's own phase and review.
- **Real-browser validation of the CDP driver**, read path and now `submitForm` alike — see
  `HUMAN_ACTION_REQUIRED.md` §2. Nothing in Phase I has run against an actual Chrome tab; the
  independent review that caught the field-selector bug found it by reading the code, not by
  running it, which is itself a reason real-browser validation still matters before granting.
- Organization model (Department -> Agent -> Capability -> Job/Workflow/AutonomyLevel) — next
  automatic phase per `CURRENT_GATE.md`.
- **Phases J-W** (Knowledge/Evidence/Memory, Monitoring, Career, Marketing, Founder, Research,
  Sales/Inbox, Integrations, Model routing/cost, Command Center expansion, security and reliability
  hardening, release/ops, end-to-end scenarios) — not started.


## Gate G visual polish notes — 2026-08-18 [IMPLEMENTED in Gate G.1, see GATE_HISTORY.md]

Yusuf reviewed the fixture Command Center, approved the core product direction, and later
authorized Gate G.1 to implement these notes. **All six are now done** — kept here with their
original constraints because those constraints still bind any future change to these surfaces.

| Note | Outcome |
|---|---|
| 1. Core dominance +20-30% | **Done** — 2.53x → 3.18x core/node radius; 135px → 170px rendered |
| 2. Adaptive small-roster spacing | **Done** — banded orbit radius; 3 agents 599 → 306 units apart |
| 3. Quieter navigation rail | **Done** — canvas surface, hairline active rule, 152px → 57px |
| 4. Stronger Agent role identity | **Done** — code-owned role glyphs + status halos + real activity arc |
| 5. Attention Queue unchanged in hierarchy | **Done** — polish only; risk level now leads the row |
| 6. No fake data to fill space | **Held** — still zero invented agents, edges, metrics or activity |

1. **Increase the central core's visual dominance by ~20–30%.**
   Today the core is r=86 against nodes at r=34 (2.53x) in a 1000-unit viewBox.
   *Constraint to respect:* the desktop layout is now viewport-height (see the visual-QA fix
   commit). Growing the core must not reintroduce page scroll at 1440x900 — verify
   `document.documentElement.scrollHeight === innerHeight` after any change. Growing the core
   radius alone is cheaper than growing the whole viewBox.

2. **Make constellation spacing adaptive for small rosters** so a 3-agent state does not read as
   mostly empty. Today `OUTER_RADIUS` is a fixed 385 units regardless of count, which is why 3
   agents sit 599 units apart edge-to-edge while 24 sit 30 apart.
   *Constraints to respect:* the layout must stay **deterministic** (same roster always yields the
   same picture — there is a unit test) and must still tolerate 0/1/3/6/10/24+ without overlap.
   A count-derived radius is fine; a random or animated one is not.

3. **Reduce the left navigation rail's visual weight.** The Command Center must stay the hero.
   *Constraint to respect:* nav targets are currently exactly 44x44 at 390px, which is the
   accessible minimum — reduce visual weight (contrast, chrome, width of the label column) rather
   than hit-target size.

4. **Give Agent nodes stronger role identity** using the existing Phosphor icon set, status halos
   and activity indicators.
   *Constraints to respect:* no fake data and no gaming-HUD styling. An icon may express the
   Agent's **role** (a code-owned property of the agent key) and its **status** (asserted by the
   projection). It may not imply activity, progress, load or health that the backend has not
   asserted — and motion still only appears where the server marks something live.

5. **Keep the right-side Attention Queue as prominent as it is.** Working well; do not dilute it
   while doing 1-4.

6. **Standing invariant, restated by Yusuf:** no fake agents, no decorative edges, no fake metrics,
   no fake activity to fill space. Empty stays honestly empty.


## Deferred after Gate G — 2026-08-18

**Deliberately not built in Gate G** (no backend support, or out of scope for a first coherent
vertical slice):

- `/os` modules with no backing state yet: career, marketing, founder, knowledge, evidence, cost,
  integrations, schedules, models, settings, and a browsable audit log.
- The **Command Bar** ("Ask / Command Yusuf OS"). A conceptual place is reserved in the shell but
  nothing is rendered — there is no backend command surface, and a fake one would be exactly the
  chatbot UI Gate G exists to avoid.
- **Agent lifecycle mutations from the UI** (create/edit/enable/disable agents, cancel tasks,
  trigger runs, flip the kill switch). Gate G is read-only apart from the one existing approval
  decision route. Adding a mutation means adding it to the control plane first, with its own
  policy path and tests.
- **RFC 9457 error migration** — still deferred per Gate F. The frontend is built against the
  current stable `{ error: { code, message, details, requestId } }` shape.
- **Screenshot / visual-regression testing.** No baseline exists and the session environment could
  not composite frames.
- **A cross-browser matrix.** Validated on the bundled Chromium only.
- **Frontend tests outside `features/yusufOS/`.** The Vitest config is deliberately scoped; the
  rest of the monorepo still has no test baseline.
 — by gate

Do not build these unprompted; they belong to specific future gates and building early would
outrun the security architecture meant to gate them.

## Gate D — DONE (2026-08-17)

Real LocalGit adapter against a disposable local repo + bare remote. See `GATE_HISTORY.md` for
full evidence. No GitHub API, no real push — both remain deferred below.

## Gate E (next, not started)

Engineering Agent and Reviewer Agent runtime/intelligence — actually using the Gate D LocalGit
capabilities through real agent reasoning, not just proving the pipeline works (Gate D wired the
adapter and full boundary chain, and reused `requestBuilders.js` from tests, but no live AIbitat
agent has `enableYusufGovernance()`/`bindTool()` called on it for LocalGit yet). See
`CURRENT_GATE.md`.

## Gate F (later)

Command Center backend projections — normalized HTTP/SSE views (`systemStatus`, `agentStatuses`,
`taskStatuses`, `approvalQueue`, `activeHandoffs`, `runProgress`, `adapterHealth`, `costSummary`,
`auditSummary`) per `docs/yusuf-os/gate-b/api-realtime-frontend.md` §4.

## Gate G (later)

Command Center frontend — the relationship-centric agent-constellation UI described in
`ROADMAP.md` / `PRODUCT_CHARTER.md`. Not a CRUD dashboard.

## Later / unscheduled

- Real GitHub API execution (Gate D is local-only).
- Open Computer / general-purpose browser automation beyond registry-mediated form submission
  (Phase I covers `browser.submit_form` only; no click/navigate/evaluate capability exists or is
  planned).
- Gmail, LinkedIn, WhatsApp, Calendar integrations (each would register its own `formRegistry.js`
  entry, or its own dedicated adapter, plus its own review — Phase I built the governance, not the
  integrations).
- Governed MCP side effects (currently MCP tools are excluded from governed runtimes, not
  governed within them).
- Governed SQL execution.
- Full specialist agent team beyond Engineering/Reviewer (Monitoring, Marketing, Career,
  Security, Research, Memory Curator, Sales, Recruiter, Founder, Finance, Strategist, Social,
  Design, Operations).
- Structured Knowledge / Evidence store distinct from raw RAG documents and from
  scoped Memory (personal/project/agent/task/conversation).
- HexaTerminal-specific Founder Agent workflows.

## Explicitly not happening without new architecture (per handoff, still accurate)

Raw shell execution (`git.raw`, `shell.exec`), `git.push_arbitrary`, `git.force_push`,
`git.reset_hard`, `git.clean` as agent-invokable capabilities — these would need their own
architecture review, not just a Gate D extension. `protected_branch.force_push` and
`protected_branch.direct_push` are already `HARD_FORBIDDEN` at the registry level, not merely
undefined.

## Updated after Gate E (2026-08-17)

Gate E is **done** (Chief of Staff / Engineering / Reviewer runtime). Still deferred:

- **Gate F (next)**: Command Center *backend projections* only — normalized `systemStatus`,
  `agentStatuses`, `taskStatuses`, `approvalQueue`, `activeHandoffs`, `runProgress`,
  `adapterHealth`, `costSummary`, `auditSummary` over HTTP + SSE. No UI.
- **Gate G**: the Command Center frontend itself — see `FRONTEND_VISION.md` for the approved
  direction that must not be replaced with a generic dashboard.
- **Real LLM provider wiring** for agent reasoning (see `KNOWN_RISKS.md` #12).
- The **full specialist agent roster** beyond the three core roles (Monitoring, Marketing,
  Career, Security, Research, Memory Curator, Sales, Recruiter, Founder, Finance, Strategist,
  Social, Design, Operations).
- **Memory Curator** and the four-way Documents / Knowledge / Evidence / Memory split.
- Everything already listed above: shell adapter, browser/Open Computer, GitHub API and real
  network push, Gmail/LinkedIn/WhatsApp/Calendar, governed MCP side effects, governed SQL.
