# Deferred Work — by gate

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
