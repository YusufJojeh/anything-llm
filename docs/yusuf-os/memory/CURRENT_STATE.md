# Current State — two-minute orientation

_Last verified: 2026-08-17, onboarding pass._

**Branch:** `feature/yusuf-os-core`, HEAD `3aec848f2885144aa8f1e53b9731a04310d5d558`
(merge of upstream `master`, tag `v1.16.0` lineage). `origin` = `github.com/YusufJojeh/anything-llm`
(read/write). `upstream` = `github.com/Mintplex-Labs/anything-llm` (fetch only, push disabled).
Working tree has the Gate C changes staged as modified/untracked files, not yet committed
(see `git status` — this was true at session start and is expected; Yusuf has not asked for a
commit).

**What's already built:** Gate B (design docs, `docs/yusuf-os/gate-b/`) and Gate C (the
deterministic security/control-plane kernel: capability registry, policy engine, action
boundary, approval service, execution coordinator, audit service, control-plane API, mandatory
runtime interception into AIbitat/scheduled jobs, migration). All independently re-verified this
session — see `GATE_HISTORY.md` and `TEST_BASELINE.md`.

**What has passed:** 13/13 Yusuf-OS-plus-affected-upstream test suites (100/100 tests), 42/42
full server test suites (392/392 tests), lint clean, `git diff --check` clean — all re-run live
this session, not just read from a record.

**Next gate:** Gate D — governed LocalGit execution vertical slice (disposable local repo + local
bare remote, no GitHub/network). **Not started.** Do not begin without Yusuf's explicit
instruction ("START GATE D").

**Must not be rebuilt:** the Gate C kernel itself (capability registry, policy engine, action
boundary, approval service, execution coordinator, audit service) — it is complete, tested, and
independently verified. Extend it; don't replace it.

**Currently deferred (do not assume built):** real LocalGit adapter, shell adapter, browser
execution/Open Computer, GitHub/Gmail/LinkedIn/WhatsApp/Calendar integrations, governed MCP side
effects, governed SQL, Chief of Staff and all specialist agents, `/os` frontend, Command Center.
Full list in `DEFERRED_WORK.md`.

**Open/residual items:** see `KNOWN_RISKS.md`. None are P0/P1 blockers as of this session.
