# Yusuf OS Program Risks

_Updated: 2026-08-27_

| ID | Risk | Likelihood / impact | Treatment | Evidence / trigger | Owner |
|---|---|---|---|---|---|
| R-001 | V1 fixture/test evidence is mistaken for current live operation | Medium / High | Preserve explicit evidence labels and commission real paths | Current Ollama smoke skipped although Phase AC records a prior live validation | Chief of Staff |
| R-002 | Local `.env` changes backend test behavior | High / Medium | Isolate environment-sensitive API tests; keep startup policy behavior explicit | Fresh default run failed one browser-speech eligibility assertion; explicit `false` passed all 57 suites | Engineering |
| R-003 | Real browser content injects instructions or abuses ambient session authority | High / Critical | Exact allowlists, semantic capabilities, hostile-content treatment, approval, verification, and separate browser profile where practical | First Chrome attachment remains unperformed | Engineering + Reviewer |
| R-004 | Same-origin XSS could access the local control token | Low / High | Maintain localhost/token guard, strong CSP, secret-safe UI, and no token logging | Security invariant and prior Phase AA review | Engineering + Reviewer |
| R-005 | Scheduler/notification integrity depends partly on application checks | Medium / Medium | Keep inherited P2 visible; add DB constraints only through a safe migration when justified | Phase AB inherited P2 | Engineering |
| R-006 | Audit sequence append can contend on a future non-SQLite database | Low now / Medium later | Do not change datasource for theory; add retry/serialization before any non-SQLite deployment | Phase AA inherited P2 | Engineering |
| R-007 | Raw notification kinds reduce operational clarity | Medium / Low | Localize/humanize labels in a bounded UX slice | Phase Z inherited P2 | Engineering |
| R-008 | Latest visual layer increases frontend payload and test noise | Medium / Medium | Measure real loading before optimization; clean jsdom WebGL/React warnings | Build reports an 817 KB WebGL chunk; tests pass with console warnings | Engineering |
| R-009 | Historical memory contains superseded “next phase” and human-action text | High / Medium | Treat append chronology and latest gate as truth; use this management layer for current plans | Phase AC supersedes the older open Ollama statement | Chief of Staff |
| R-010 | Local and remote histories are divergent | High / Medium | Keep local-first; no push/rebase/reset; reconcile only by explicit Yusuf decision | Local baseline ahead 29, behind 1; remote-only patch differs by `.claude/launch.json` | Yusuf |
| R-011 | Cloud migration expands the attack and cost surface without value | Low / High | Keep local-first until an evidenced always-on/remote/backup/worker need exists | No current cloud requirement | Founder |

