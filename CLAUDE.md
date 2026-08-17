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

See `docs/yusuf-os/memory/CURRENT_GATE.md` for the authoritative current state. As of 2026-08-17:
Gates B, C, D, E and **F** are complete and verified (546 tests green). Gate E added the first
governed AI staff runtime — Chief of Staff / Engineering / Reviewer with isolated capabilities,
durable handoffs, independent review verdicts, and a deterministic completion gate. Gate F added
the read-only Command Center backend projections (`/dashboard`, `/events`, SSE `/events/stream`)
— **no UI**. Gate G (the `/os` Command Center frontend) has **not** started. Do not begin Gate G
without Yusuf's explicit instruction, and read `docs/yusuf-os/memory/FRONTEND_VISION.md` first so
the approved Command Center direction is preserved.

**Review lesson (Gate E/F):** self-review is materially weaker than independent review. Both gates
claimed a clean bill of health from self-audit and an independent pass then found real High/Medium
issues. Run an independent security review before reporting P0/P1 = 0.

## Ground rules

- Never redefine a hard-forbidden capability's meaning outside `server/domain/yusufOS/capabilities/registry.js` — that registry is the single source of security truth, not the database.
- Never let a scheduled/unattended job auto-approve an L3+ action — this was a real vulnerability that was fixed (see `docs/yusuf-os/memory/GATE_HISTORY.md`); don't reintroduce it.
- Never commit secrets. `YUSUF_OS_AUDIT_HMAC_KEY` and `YUSUF_OS_CONTROL_TOKEN` are required env vars (32+ chars) and must never be generated/committed here — only referenced by name.
- Run tests from the **repo root**, not `server/` (`server/package.json` has no jest; root `package.json` does): `npx jest server/__tests__/yusufOS server` etc.
- `upstream` remote push is disabled — never push to `Mintplex-Labs/anything-llm`. Only `origin` (Yusuf's fork) is writable, and only with explicit approval.
- Prefer isolated Yusuf OS modules over scattering `if (yusufOS)` conditionals through upstream AnythingLLM code; when an upstream file must change, keep the diff narrow (see the modified-file list above for the accepted pattern).
