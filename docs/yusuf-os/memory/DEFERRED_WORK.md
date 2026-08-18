# Deferred Work

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
- Browser Broker / Open Computer / production browser automation.
- Gmail, LinkedIn, WhatsApp, Calendar integrations.
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
