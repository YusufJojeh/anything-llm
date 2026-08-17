# Product Charter [DOCUMENTED_DECISION — source: docs/yusuf-os/gate-b/README.md, handoff prompt]

Yusuf OS is a **personal, single-user AI operating system** for Yusuf Mohammad Jojeh, built as a
security-governed fork/extension of AnythingLLM (baseline v1.16.0, SQLite, single-user mode).

The product vision: **"Yusuf has an AI staff, not a chatbot."** A central Chief of Staff will
eventually orchestrate specialized agents (Engineering, Reviewer, Monitoring, Marketing, Career,
Research, Memory, Security, Sales, Recruiter/Inbox, Founder, Social, Operations, Strategy). This
is deferred — the current work builds the secure control plane *before* any agent gets real-world
authority.

## What it is not

Not a chatbot skin, not renamed AnythingLLM workspaces, not an unrestricted browser-automation
system, not a pile of shell scripts an LLM drives directly, not a multi-tenant product.

## Product-level decisions that shape engineering choices

- **Browser-First / Local-Tool-First**: prefer the user's existing authenticated browser session
  or local CLI (`git`, `gh`) over forcing new API credentials from every platform. APIs are
  optional adapters, not the default path. ([ADR-005](../gate-b/adrs/ADR-005-browser-first-local-tool-first.md))
- **Credential principle**: never casually extract/persist passwords, cookies, session tokens,
  private keys, or `.env` secrets. The system should know *authenticated / expired / unavailable /
  needs_login / permission_missing*, not the credential itself.
- **Human approvals + auditability are core product features**, not just security theater — the
  eventual Command Center UI surfaces "what's waiting for Yusuf" as a first-class concept.
- **Model strategy**: provider-agnostic; prefers local/open models where practical but can use
  external models (OpenAI etc.) when they add material value. Never hard-code the control plane
  to one provider.
- **Frontend vision (deferred, but must not be lost)**: `/os` is meant to be a relationship-centric
  "AI Staff Command Center" — an agent constellation with real state, not a CRUD dashboard. See
  `ROADMAP.md` and `docs/yusuf-os/gate-b/api-realtime-frontend.md`.

## Personal/business context (for judgment calls only — do not hardcode into security logic)

Yusuf's engineering background: backend engineering, SaaS/CRM/ERP, Laravel, FastAPI, React, REST
APIs, PostgreSQL/MySQL, Redis, RBAC, multi-tenancy, AI workflows. Known side projects/portfolio:
Rakez ERP/CRM, Dhura GCC Real Estate SaaS, CareerGuide AI, HireLens AI, LinguaCoach AI,
iLogistics, Business Flow, Mytrixa, HexaTerminal (longer-term founder/SaaS direction). This
context belongs to future structured Knowledge/Evidence storage, not to security policy.
