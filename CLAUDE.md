# Yusuf OS — Working Notes for Claude Code

This repository is `Mintplex-Labs/anything-llm` forked and extended into **Yusuf OS**, a personal,
single-user AI operating system for Yusuf Mohammad Jojeh. It is not a generic AnythingLLM
deployment — treat Yusuf-OS code paths as security-sensitive infrastructure, not app features.

Full context lives in `docs/yusuf-os/memory/` — **read `docs/yusuf-os/memory/README.md` first**
in any new session touching Yusuf OS. This file is only a map.

## The one invariant that must never be weakened

```
Agents think. Control Plane authorizes. Execution Plane acts. Verification proves. Audit remembers.
```

No agent, MCP tool, Agent Flow, imported skill, scheduled job, or direct handler call may cause a
side effect without passing through `server/domain/yusufOS/runtime/YusufActionBoundary.js` →
Policy → (approval if required) → Execution Coordinator → Verification → Audit. See
`docs/yusuf-os/memory/ARCHITECTURE_INVARIANTS.md`.

## Where things are

- Design docs (source of truth for architecture): `docs/yusuf-os/gate-b/` (README, ADRs, threat model, contracts)
- Gate C engineering record: `.engineering-intelligence/gate-c.md`
- Yusuf OS domain/security kernel: `server/domain/yusufOS/`
- Yusuf OS Prisma models + migration: `server/models/yusufOS/`, `server/prisma/migrations/20260817033000_add_yusuf_os_core/`
- Yusuf OS control-plane API: `server/endpoints/yusufOS/index.js` (mounted at `/api/yusuf-os/*`, localhost + bearer token only)
- Yusuf OS tests: `server/__tests__/yusufOS/`
- Upstream files modified to add mandatory interception: `server/utils/agents/aibitat/index.js`, `defaults.js`, `ephemeral.js`, `imported.js`, `server/jobs/run-scheduled-job.js`, `server/models/scheduledJob.js`, `server/endpoints/scheduledJobs.js`, `server/index.js`
- Persistent project memory: `docs/yusuf-os/memory/` — **update this at the end of every substantial session** (see `SESSION_HANDOFF.md` and `MEMORY UPDATE PROTOCOL` in `README.md`)

## Current gate

See `docs/yusuf-os/memory/CURRENT_GATE.md` for the authoritative current state. As of 2026-08-18:
Gates B through **G** are complete and verified (559 server tests + 77 frontend tests green).
Gate E added the first governed AI staff runtime; Gate F added the read-only Command Center
backend projections; **Gate G added the `/os` AI Staff Command Center frontend** — an agent
constellation with real handoff edges, an Attention Queue, task/run/approval drilldowns, System
Health, snapshot-first SSE reconciliation, an accessible non-graph equivalent, English + Arabic
with RTL, and a browser session bootstrap that never lets the browser hold the control token.
`/` is unchanged. **No gate H is defined** — do not start one without Yusuf's explicit
instruction. Read `docs/yusuf-os/memory/FRONTEND_VISION.md` before any `/os` change; its
principles are still the acceptance criteria.

**Review lesson (Gates E/F/G):** self-review is materially weaker than independent review. Three
gates running, the implementation looked finished and every check was green, and a deliberate
independent pass still found real issues each time. Run it before reporting a clean bill of
health.

**Frontend note:** Yusuf OS UI lives only in `frontend/src/features/yusufOS/` and
`frontend/src/pages/YusufOS/`. Yusuf OS HTTP calls go through
`features/yusufOS/api/client.js` and nowhere else. Frontend tests:
`cd frontend && npx vitest run --config vitest.config.js`.

## Ground rules

- Never redefine a hard-forbidden capability's meaning outside `server/domain/yusufOS/capabilities/registry.js` — that registry is the single source of security truth, not the database.
- Never let a scheduled/unattended job auto-approve an L3+ action — this was a real vulnerability that was fixed (see `docs/yusuf-os/memory/GATE_HISTORY.md`); don't reintroduce it.
- Never commit secrets. `YUSUF_OS_AUDIT_HMAC_KEY` and `YUSUF_OS_CONTROL_TOKEN` are required env vars (32+ chars) and must never be generated/committed here — only referenced by name.
- Run tests from the **repo root**, not `server/` (`server/package.json` has no jest; root `package.json` does): `npx jest server/__tests__/yusufOS server` etc.
- `upstream` remote push is disabled — never push to `Mintplex-Labs/anything-llm`. Only `origin` (Yusuf's fork) is writable, and only with explicit approval.
- Prefer isolated Yusuf OS modules over scattering `if (yusufOS)` conditionals through upstream AnythingLLM code; when an upstream file must change, keep the diff narrow (see the modified-file list above for the accepted pattern).
