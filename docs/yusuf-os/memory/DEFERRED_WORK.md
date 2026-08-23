# Deferred Work

## Final V1 release gate — 2026-08-24

- Live OpenAI validation remains unavailable without a user-provided API key;
  Phase AC truthfully records it as implemented but not live-validated.
- Real browser, Career form, Gmail, LinkedIn, WhatsApp, and Calendar actions
  remain human-controlled and disabled/unconfigured unless Yusuf explicitly
  supplies the integration, credentials, and approval. They are not V1 test
  failures and must never be simulated as live work.

## Human-controlled after Phase X (Browser readiness) — 2026-08-24

- Concrete production form registration remains unstarted and requires Yusuf to choose an exact
  origin, site, field mapping, account identity strategy, and confirmation signal.
- Live browser attachment remains human-assisted; the broker is disabled by default and must not
  be enabled or pointed at a browser without Yusuf's explicit operator action.

## Deferred after Phase W (Agentic Career E2E) — 2026-08-22

- Add a comprehensive rejection matrix for invalid `career.confirm_verified_application` proofs.
- Replace legacy direct-database APPLIED setup with a digest-consistent governed fixture helper.
- Phase X is readiness validation only; real submissions still require Yusuf's live browser,
  explicit origin/form registration, enabled broker, and per-intent L3 approval.

## Deferred after Phase V (Agentic Engineering E2E) — 2026-08-22

- Phase V is complete. Phase W Agentic Career E2E is now the critical path.
- Add a direct regression for receipt-evidence projection idempotence after process recovery or
  loop re-entry; the E2E already verifies no duplicate evidence across normal repeated loop
  checkpoints.
- Live Ollama Agent-loop behavior remains environment-gated. The smoke runs automatically when a
  compatible local daemon/model is available; this session had none.

## Deferred after Phase U (Voice / Audio Plane) — 2026-08-21

- Phase U is complete. Phase V Agentic Engineering E2E is now the critical path.
- Expose server-provider voice catalogs/selection in `/os` when the configured provider offers
  voices; the current selector intentionally contains browser speech-synthesis voices only.
- Expand the deterministic audio matrix for microphone unavailable, automatic 60-second stop,
  remote browser-voice exclusion, repeated playback, Arabic STT, hostile transcript/audio
  injection, and direct non-persistence assertions.
- Wake-word detection remains optional and must not block V1; push-to-talk is the supported V1
  interaction.
- Live provider checks remain environment-gated; no cloud speech or paid API was invoked.

## Deferred after Phase T (Real Agentic Reasoning Loop) — 2026-08-21

- Phase T is complete. Phase U Voice / Audio is now the critical path.
- Add durable reconciliation for a process crash between the handoff reservation transactions.
- Distinguish policy-preference deviation from attempted-provider fallback in routing telemetry.
- Measure OpenAI latency after bounded response-body transfer/parsing, not at response headers.
- Live Ollama/OpenAI completion validation remains blocked by unavailable local credentials/services.
- The scheduler/always-on phase must add the production trigger that starts eligible queued runs;
  Phase T deliberately provides the safe executor, not a background scheduler.

## Deferred after Phase S (Runtime Command Center) — 2026-08-21

- Phase S is complete. Live Ollama/OpenAI validation remains environment-blocked and honestly
  reported in `HUMAN_ACTION_REQUIRED.md`.
- The runtime page intentionally exposes Knowledge/Memory counts and code-owned enum groupings
  only; free-text titles, keys, values, payloads, and scope references remain hidden until an
  explicit visibility contract exists.
- The next critical-path work is Phase T: a real structured Agent reasoning loop. No current
  production caller invokes `RoutedModelClient` yet.
- Voice, agentic E2E fixtures, real browser integrations, scheduler/notifications, full
  operational UI, hardening, live validation, and release/ops remain later phases in the approved
  S→AE order.

## Deferred after Phase R (Model runtime / ModelRouter) — 2026-08-21

Phase R is **done** — see `CURRENT_GATE.md`. Still deferred:

- **No live agentic loop calls a `ModelClient` for a real completion yet.** `RoutedModelClient` and
  `AgentRunCoordinator.recordModelCompletion()` are production-ready but currently have no caller —
  `ChiefOfStaff`/`AgentRunCoordinator` orchestrate task/run state without yet invoking a model to
  decide anything. Wiring an actual reasoning loop (prompt assembly with `wrapUntrusted`, calling
  `RoutedModelClient.complete()`, parsing a structured tool-call response, invoking
  `toolBinding.invokeCapability`) is future work, not something this phase could respect scope and
  still add.
- **`OllamaProvider.describeModel()` (`/api/show`) is implemented but unused by `ModelRouter`.** It
  exists for future capability-aware routing (e.g. refusing a model known to lack tool-calling) but
  nothing calls it yet.
- **`DashboardProjection.js`'s existing `estimatedCostMicros: ... || 0` aggregate-sum pattern was
  noticed, not touched.** It sums cost across many runs for a display total, so a null term
  behaving as 0 in a SUM is a different (and arguably correct) concern from the per-run
  UNAVAILABLE-must-never-become-0 rule this phase enforces on individual `AgentRun` rows. Flagging
  it here rather than changing dashboard aggregation behavior outside this phase's stated scope.
- **A real per-model, per-token OpenAI price table is a rough approximation** (`gpt-4o-mini` only,
  in `OpenAIProvider.js`'s `PRICE_MICROS_PER_TOKEN`). Any other requested model reports cost as
  UNAVAILABLE rather than guessing — correct by this phase's own rule, but means most models
  currently show no cost at all. Expanding the table is a config change, not an architecture one.
- **Ollama/OpenAI live smoke were not exercised against a real endpoint in this session** — no
  local Ollama daemon was reachable and no `OPENAI_API_KEY` was set in this environment. Both live
  smoke tests are written and will run automatically the next time either is available; this is not
  a gap in the test code, just an environment fact worth re-checking before relying on it.

## Deferred after Phase Q (Application submission seam) — 2026-08-20

Phase Q is **done** — see `CURRENT_GATE.md`. Still deferred:

- **A real job-application form registration in `formRegistry.js`.** It still ships empty. Career
  holding `browser.submit_form` makes the capability reachable, not usable — registering a real
  form for a specific job site is a per-integration decision, same as every prior "not a real
  integration yet" deferral (Career's job-board integration, Marketing's publishing integration,
  Inbox's `gmail.*`).
  Broker attachment — see `HUMAN_ACTION_REQUIRED.md` §2, unchanged.
- **No actual live run of the full end-to-end scenario against a real site.** This phase proves the
  mechanism (every capability exists and is correctly governed); it does not and cannot prove a
  real submission until the two items above are resolved by Yusuf.
- **No retention policy on `applicationNotes`** — same accepted gap as every other free-text field
  in this system (`notes`, `snippet`, `draftReplyBody`, etc.), not re-litigated here.
- **No Career-specific Command Center surfacing** — same "mechanism first, UI later" pattern as
  every prior phase; the generic Gate F projections already reflect this activity via tasks/runs/
  approvals/audit.
- **Everything after Phase Q** — the next phase has not been chosen; check with Yusuf before
  picking Integrations, Model routing/cost, Command Center expansion, or hardening, since no
  design doc exists yet for any of them.

## Deferred after Phase P (Sales/Inbox) — 2026-08-20

Phase P is **done** — see `CURRENT_GATE.md`. Still deferred:

- **Any live email connection** — no IMAP/Gmail API/SMTP wiring exists; Inbox tracks messages a
  human or Agent tells it about, same "no automation yet" shape as Career's job-board integration
  and Marketing's publishing integration.
- **`gmail.send_reply`/`gmail.archive_thread`/`gmail.apply_label`** — named in the design note's
  risk table as forward-looking placeholders only. Building any of them requires satisfying the
  full send-specific attack checklist pre-recorded in `docs/yusuf-os/gate-b/sales-inbox.md` (wrong-
  account send, wrong-thread reply, recipient substitution, BCC/CC injection, reply-all expansion,
  HTML/prompt injection, malicious email content, attachment/path leakage, duplicate send,
  `FAILED_UNKNOWN` send, message-id spoofing, draft mistaken for sent, model-generated recipients,
  auto-send from an `AUTONOMOUS` Agent, scheduled-send bypass) plus full identity/thread/recipient/
  body-digest binding on the approval per Yusuf's requirement 3 — a separate, larger decision, not
  a small extension of this phase.
- **No retention on `yusuf_inbox_messages`** — same accepted gap already left on Career/Marketing/
  Founder/Research/Knowledge/Memory/Monitoring, not re-litigated here.
- **No Command Center UI surfacing** of inbox messages — backend-only this phase.
- **A second cross-domain seam capability of this shape** — `inbox.advance_linked_career_status` is
  the first of its kind (an Agent writing into another domain's table via a narrow, code-enforced
  capability rather than a raw grant). If a future phase needs a similar seam (e.g. Marketing
  learning of a lead from Inbox), design it the same way — resolve the target from the *source*
  record's own validated linkage, never accept the target id as a raw caller-supplied argument —
  rather than granting the target domain's raw update capability directly.
- **Everything after Sales/Inbox in the CAVEMAN MODE order** — Integrations, Model routing/cost,
  Command Center expansion, security/reliability hardening, release/ops, and the end-to-end
  scenario Yusuf described (Job found -> Research -> Career -> Evidence check -> Application
  prepared -> Needs Yusuf -> Approval -> Browser -> Submission verification -> Inbox monitors reply
  -> Career state updated -> Command Center) — not started.

## Deferred after Phase O (Research) — 2026-08-20

Phase O is **done** — see `CURRENT_GATE.md`. Still deferred:

- **Automated web research/search execution** — deliberately deferred; Research tracks pipeline
  state only. Real automation needs the Browser Broker plus a real search integration, a separate,
  larger decision.
- **Structured citation/source-linking beyond `knowledge.*`** — out of scope this phase.
- **No retention on `yusuf_research_items`** — same accepted gap already left on Career/Marketing/
  Founder/Knowledge/Memory/Monitoring, not re-litigated here.
- **No Command Center UI surfacing** of research items — backend-only this phase.
- **Everything after Research in the CAVEMAN MODE order** — Sales/Inbox, Integrations, Model
  routing/cost, Command Center expansion, security/reliability hardening, release/ops, end-to-end
  scenarios — not started.

## Deferred after Phase N (Founder) — 2026-08-20

Phase N is **done** — see `CURRENT_GATE.md`. Still deferred:

- **Financial/investment tracking for ventures** — deliberately deferred to a future Finance
  phase; Founder tracks pipeline state only, never money.
- **Legal/incorporation automation** — out of scope entirely.
- **No retention on `yusuf_founder_ventures`** — same accepted gap already left on Career/
  Marketing/Knowledge/Memory/Monitoring, not re-litigated here.
- **No Command Center UI surfacing** of ventures — backend-only this phase.
- **Everything after Founder in the CAVEMAN MODE order** — Research, Sales/Inbox, Integrations,
  Model routing/cost, Command Center expansion, security/reliability hardening, release/ops,
  end-to-end scenarios — not started.

## Deferred after Phase M (Marketing) — 2026-08-20

Phase M is **done** — see `CURRENT_GATE.md`. Still deferred:

- **Any real publishing/posting integration.** No Twitter/CMS/social wiring exists; `PUBLISHED` is
  an unverified self-report. Real integration needs the Browser Broker plus a per-service form
  registration (Phase I's own pattern), a separate, larger decision — same shape as Career's
  deferred job-board integration.
- **Content generation/drafting assistance** — out of scope; Marketing tracks state, it does not
  produce copy.
- **No retention on `yusuf_marketing_content`** — same accepted gap already left on Career/
  Knowledge/Memory/Monitoring, not re-litigated here.
- **No Command Center UI surfacing** of marketing content — backend-only this phase.
- **No analytics/engagement tracking** on published content — out of scope; pipeline state only.
- **Everything after Marketing in the CAVEMAN MODE order** — Founder, Research, Sales/Inbox,
  Integrations, Model routing/cost, Command Center expansion, security/reliability hardening,
  release/ops, end-to-end scenarios — not started.

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
