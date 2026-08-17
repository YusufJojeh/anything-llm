# Skills Inventory

**Last discovery date: 2026-08-17.** Discovered via the harness's available-skills listing
(names + one-line descriptions), not by reading every `SKILL.md` in full — that only happens when
a specific task calls for a given skill's detailed guidance. Gate B's verdict doc already records
which skills materially shaped the *design* (`docs/yusuf-os/gate-b/gate-b-verdict.md`, "Skills
used and evidence contributed" table) — this file is the broader inventory for future sessions
deciding what to load.

## Backend / architecture

`backend-system-architect`, `pragmatic-backend-architecture`, `greenfield-backend-architect`,
`backend-overengineering-killer`, `architecture-health-lens`, `fullstack-system-architect`,
`fullstack-architecture-health` — relevant now for Gate D adapter design and any future kernel
extension; load `backend-overengineering-killer` specifically before adding abstraction to the
already-complete Gate C kernel.

## Security

`backend-security`, `browser-security-engineer`, `security-threat-model` (anthropic-skills),
`fullstack-security`, `security-review` (slash command), `security-best-practices`
(anthropic-skills). Highest-value group for this project. `browser-security-engineer` becomes
relevant once the browser-first adapter work starts (deferred). `security-review` is the
general-purpose reviewer skill — use before any Gate D PR.

## Reliability / testing / debugging

`backend-reliability`, `backend-testing`, `fullstack-testing`, `backend-debugger`,
`fullstack-debugger`, `migration-safety`, `deployment-production-readiness`,
`backend-audit` — `migration-safety` matters again the moment Gate D adds a new migration;
`backend-audit` matches the read-only audit style this onboarding pass itself used.

## Database

`database-engineer`, `postgresql-pro`, `mysql-pro`, `mongodb-pro`, `redis-pro` — only
`database-engineer` is currently relevant (SQLite via Prisma); the others are dormant unless the
datasource changes (schema.prisma has a commented-out Postgres block already).

## API / integration

`api-contract-quality`, `api-client-contracts`, `integration-engineer`,
`web-api-boundary-engineer`, `ai-backend-engineer` — relevant to the `/api/yusuf-os/*` surface
and to any future external adapter (Gate D's LocalGit adapter counts as an "integration").

## Auth / session

`auth-session-engineer` — directly informed the control-plane localhost+token design; re-check
against it if the auth mechanism ever changes.

## Frontend (deferred until Gate F/G, per `DEFERRED_WORK.md`)

`frontend-architecture`, `frontend-accessibility`, `frontend-overengineering-killer`,
`frontend-performance`, `state-data-flow-engineer`, `realtime-engineer`,
`internationalization-rtl`, `responsive-ui-engineer`, `component-api-quality`,
`design-system-engineer`, `progressive-enhancement-engineer`,
`anthropic-skills:agentic-ux-design-relationship-centric-interfaces`, `ui-ux-pro-max`,
`anthropic-skills:ui-design`, `anthropic-skills:ui-styling`,
`anthropic-skills:web-design-guidelines` — do not load these until Command Center frontend work
actually starts; loading them now would bias implementation toward UI concerns prematurely.

## Multi-tenant / monorepo / conventions

`multi-tenant-saas` (not directly relevant — Yusuf OS is explicitly single-user, don't apply
multi-tenant patterns here), `monorepo-workspace-engineer` (relevant — server/frontend/collector
boundary), `project-conventions`, `fullstack-project-conventions`.

## Git / CLI / process automation

No dedicated "git-adapter" skill was found in the listing; closest are `integration-engineer` and
general backend skills. When Gate D starts, there is no existing skill specifically for
"governed local git adapter design" — rely on `docs/yusuf-os/gate-b/adapter-governance.md` §3
and `backend-security` instead.

## Slash-command-style skills likely to recur on this project

`code-review` (review diffs, `--fix`/`--comment` options), `security-review`, `simplify`,
`init` (CLAUDE.md scaffolding — already used manually this session instead), `run` (launch app
and screenshot), `engineering:code-review`, `engineering:architecture`,
`engineering:system-design`, `engineering:debug`, `engineering:testing-strategy`.

## Not relevant to this project (noted so future sessions don't waste time evaluating them)

Marketing/brand/SEO/sales/product-management/design-critique skill families, Twilio kit,
Postman kit, most `data:*` (BI/dashboard) skills, career/job-search skills
(`80f13075...get_resume`/`search_jobs` MCP tools) — these belong to Yusuf's *other* projects, not
to Yusuf OS engineering itself, per `PRODUCT_CHARTER.md`'s note to keep memory relevant to this
project.
