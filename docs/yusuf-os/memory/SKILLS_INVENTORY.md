# Skills Inventory

**Last verified: 2026-09-06**, via a live `ListSkills` call (ground truth for what is actually
enabled/invocable *this session*) — **not** by grepping installed `SKILL.md` files under
`marketplace-sources/`, which lists everything *available in the marketplace*, not everything
*enabled*, and **not** by trusting any list recorded below from a prior session.

## The enabled-skill set is observed to fluctuate session-to-session — do not trust a snapshot

Three independent data points now confirm this, not two:

- 2026-08-17: `backend-security`, `backend-reliability`, `backend-testing`, `database-engineer`,
  `frontend-architecture`, `frontend-accessibility`, `security-review`, `migration-safety`,
  `api-contract-quality`, `auth-session-engineer`, etc. present.
- 2026-09-04: none of those present; a different set.
- 2026-09-05: every one of the 2026-08-17 names present again, plus more (full list below).
- **2026-09-06 (this session): a live `ListSkills` call returned yet another completely different
  enabled set — largely consumer/marketing/creative-tool skills, with none of the specific backend/
  frontend engineering skill names listed anywhere in this file's history.** This is the third
  distinct roster observed across four checks, ruling out "it settles after the first surprise" —
  the set is genuinely re-randomized or re-configured per session, not converging on a stable
  baseline. This session did not capture the exact new roster verbatim before compaction; the
  finding that matters is the fluctuation itself, not this particular session's specific list.

**The lesson is not that any one entry below was wrong — it's that this file's contents are a
snapshot of a set that changes between sessions** (workspace/plugin configuration, not something
Yusuf OS code controls). **Never rely on a name from this file's history sections without checking
the current session's own available-skills listing (or calling `ListSkills`) first** — that is the
one part of this file's guidance that has now been proven right three times by being violated once
each time. Treat every specific skill name below as "was available at least once," never as "is
available now."

## Enabled set observed 2026-09-05 (superseded by the 2026-09-06 fluctuation above — history only)

`backend-security`, `backend-reliability`, `backend-testing`, `database-engineer`,
`frontend-architecture`, `frontend-accessibility`, `security-review`, `migration-safety`,
`api-contract-quality`, `auth-session-engineer`, `api-client-contracts`, `component-api-quality`,
`realtime-engineer`, `state-data-flow-engineer`, `internationalization-rtl`,
`responsive-ui-engineer`, `design-system-engineer`, `progressive-enhancement-engineer`,
`frontend-performance`, `frontend-overengineering-killer`, `backend-performance`,
`backend-debugger`, `backend-audit`, `backend-overengineering-killer`, `multi-tenant-saas`,
`monorepo-workspace-engineer`, `project-conventions`, `fullstack-project-conventions`,
`deployment-production-readiness` were all enabled that session.

## Historically relevant to Yusuf OS engineering when enabled (last confirmed enabled 2026-09-05; NOT enabled 2026-09-06 — see fluctuation note above)

- `backend-security`, `fullstack-security` — direct fit for the Yusuf OS security kernel.
- `security-best-practices`, `security-threat-model` (anthropic-skills), `security-review` (slash
  command) — use before/after any change touching a trust boundary.
- `backend-reliability`, `backend-testing`, `fullstack-testing`, `migration-safety` — migration-
  safety matters again the moment a schema change touches CHECK constraints (see `KNOWN_RISKS.md`
  #11, #23).
- `database-engineer` — SQLite via Prisma is the only live datasource.
- `backend-debugger`, `fullstack-debugger`, `systematic-debugging` — root-cause work.
- `backend-overengineering-killer`, `vanity-engineering-review`, `skimmable` — pre-commit
  simplification passes; use before adding abstraction to the security kernel specifically.
- `api-contract-quality`, `api-client-contracts`, `web-api-boundary-engineer` — the
  `/api/yusuf-os/*` control-plane surface.
- `auth-session-engineer` — directly informed the localhost+token control-plane design originally;
  re-check against it if the auth mechanism ever changes.
- `frontend-architecture`, `frontend-accessibility`, `frontend-performance`,
  `internationalization-rtl`, `responsive-ui-engineer`, `state-data-flow-engineer`,
  `realtime-engineer`, `component-api-quality`, `design-system-engineer` — the `/os` Command
  Center and Agent Workspace are now built and live in this surface's territory.
- `ui-ux-pro-max`, `ui-design`, `web-design-guidelines`,
  `agentic-ux-design-relationship-centric-interfaces` — the last one directly matches the Command
  Center's own design philosophy (`FRONTEND_VISION.md`); use when evaluating whether a new surface
  still reads as relationship-centric rather than generic-dashboard/chat.
- `multi-tenant-saas` — **do not apply**; Yusuf OS is explicitly single-user, noted here only so a
  future session doesn't load it and misapply multi-tenant patterns.
- `writing-guidelines` — for `docs/yusuf-os/` prose passes.

Always confirm against the current session's own listing before relying on any of the above by
name — that is the entire point of the section above this one.

## Not relevant to this project (still true)

Marketing/brand/SEO/sales/product-management-tool/design-critique skill families, Twilio kit,
Postman kit, most `data:*` (BI/dashboard) skills, LinkedIn/career-search skills — these belong to
Yusuf's *other* projects, not to Yusuf OS engineering itself, per `PRODUCT_CHARTER.md`'s note to
keep memory relevant to this project.

---

## Prior discovery (2026-08-17) — superseded, kept for history only

Discovered via the harness's available-skills listing at the time. As of 2026-09-04 this no
longer reflects the actual enabled set (see above) — do not act on the specific names below
without first confirming via `ListSkills`.

### Backend / architecture

`backend-system-architect`, `pragmatic-backend-architecture`, `greenfield-backend-architect`,
`backend-overengineering-killer`, `architecture-health-lens`, `fullstack-system-architect`,
`fullstack-architecture-health`.

### Security

`backend-security`, `browser-security-engineer`, `security-threat-model` (anthropic-skills),
`fullstack-security`, `security-review` (slash command), `security-best-practices`
(anthropic-skills).

### Reliability / testing / debugging

`backend-reliability`, `backend-testing`, `fullstack-testing`, `backend-debugger`,
`fullstack-debugger`, `migration-safety`, `deployment-production-readiness`, `backend-audit`.

### Database

`database-engineer`, `postgresql-pro`, `mysql-pro`, `mongodb-pro`, `redis-pro`.

### API / integration

`api-contract-quality`, `api-client-contracts`, `integration-engineer`,
`web-api-boundary-engineer`, `ai-backend-engineer`.

### Auth / session

`auth-session-engineer`.

### Frontend

`frontend-architecture`, `frontend-accessibility`, `frontend-overengineering-killer`,
`frontend-performance`, `state-data-flow-engineer`, `realtime-engineer`,
`internationalization-rtl`, `responsive-ui-engineer`, `component-api-quality`,
`design-system-engineer`, `progressive-enhancement-engineer`.

### Multi-tenant / monorepo / conventions

`monorepo-workspace-engineer`, `project-conventions`, `fullstack-project-conventions`.

### Slash-command-style skills

`code-review`, `security-review`, `simplify`, `init`, `run`, `engineering:code-review`,
`engineering:architecture`, `engineering:system-design`, `engineering:debug`,
`engineering:testing-strategy`.
