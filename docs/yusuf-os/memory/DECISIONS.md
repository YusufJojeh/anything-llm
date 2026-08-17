# Decisions [not fully captured by an ADR, or worth surfacing outside them]

Full ADRs: `docs/yusuf-os/gate-b/adrs/`. This file only adds decisions not obvious from reading
one ADR in isolation, or decisions made during Gate C implementation itself.

| Decision | Date | Reason | Status | Source |
|---|---|---|---|---|
| Scheduled/unattended jobs must never auto-approve tool mutations, even legacy (non-Yusuf) ones | Gate C | Prior code (`run-scheduled-job.js`) unconditionally auto-approved every tool call for scheduled jobs — a real bypass of any future approval requirement | Implemented | `server/jobs/helpers/scheduled-approval-policy.js`, diff in `GATE_HISTORY.md` |
| Unattended scheduled jobs get a tiny code-owned tool allowlist (`rag-memory`, `document-summarizer`) instead of "no tools disabled by default" | Gate C | Even read-mostly tools shouldn't be assumed safe unattended without an explicit allowlist decision | Implemented | `SAFE_UNATTENDED_SCHEDULED_TOOLS` in `scheduled-approval-policy.js` |
| MCP tools and Agent Flow tools are tagged `EXTERNAL_TOOL_UNGOVERNED` and *excluded* from governed runtimes rather than governed in place | Gate C | Governing them properly (per-tool policy mapping to external systems) is out of scope for Gate C; false containment would be worse than an honest exclusion | Implemented, deferred properly | `server/utils/MCP/index.js`, `server/utils/agentFlows/index.js`; deferred item in `DEFERRED_WORK.md` |
| Git capability keys for Gate D are pre-registered now but hard-denied via `GATE_D_DEFERRED` | Gate C | Lets the capability registry, tests, and policy precedence logic be exercised end-to-end for git.* keys before the actual adapter exists, without granting any authority early | Implemented | `server/domain/yusufOS/capabilities/registry.js` |
| Tests run from repo root via the root `package.json`'s jest, not from `server/` | Gate C (pre-existing repo convention) | `server/package.json` has no test script or jest devDependency; jest is a root-level devDependency | Confirmed this session | `TEST_BASELINE.md` |
| Yusuf-OS request context always stamps principal as `{type: "USER", id: "local-yusuf"}` | Gate C | Single-user system behind the localhost+bearer-token control-plane guard — there is only one legitimate human principal, so it's fixed rather than derived from a session | Implemented | `server/domain/yusufOS/api/requestContext.js` |

Add to this table only when something genuinely new and non-obvious is decided — most
architectural decisions belong in a proper ADR under `docs/yusuf-os/gate-b/adrs/`, not here.
