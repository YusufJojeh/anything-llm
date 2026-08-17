# Known Risks

Carried from Gate C's residual-risk record plus Gate D additions, re-assessed 2026-08-17. None
are P0/P1 as of this session — treat as things to watch, not things to unprompted-fix. (Two
P1-equivalent issues *were* found during Gate D's own review and are documented as fixed in
`GATE_HISTORY.md`, not listed here since they no longer describe current behavior.)

1. **HMAC key / control token availability.** [VERIFIED_FROM_REPOSITORY] Both
   `YUSUF_OS_AUDIT_HMAC_KEY` and `YUSUF_OS_CONTROL_TOKEN` are required env vars with no default —
   correct fail-closed behavior, but it means a misconfigured deployment simply stops working
   (audit append throws, control plane returns 503) rather than degrading. This is the intended
   tradeoff (fail closed over fail open); just don't "fix" it by adding a default value.

2. **Execution/audit contention is conservative by design.** [VERIFIED_FROM_REPOSITORY]
   Every state transition uses a conditional `updateMany` keyed on current status+version; a lost
   race throws a 409-class error rather than retrying automatically. Correct for SQLite and for
   security (no silent double-execution), but callers (future adapters, future UI) need to handle
   409s explicitly rather than assuming success.

3. **Imported Node skill trust model.** [DOCUMENTED_DECISION, Gate B] Arbitrary imported Node
   skills execute in-process; Gate C did not attempt to sandbox them further — it excludes them
   entirely from governed/unattended paths (`blockUngovernedExtensions`, `trustClassification:
   "LOCAL_PLUGIN_UNGOVERNED"`) rather than claiming false containment. Do not treat an imported
   skill as safely sandboxed in future work; it is deliberately kept out of Yusuf-governed flows,
   not made safe within them.

4. **MCP tool isolation.** [DOCUMENTED_DECISION] Same pattern as (3) —
   `trustClassification: "EXTERNAL_TOOL_UNGOVERNED"` on MCP-sourced functions
   (`server/utils/MCP/index.js`), excluded from governed runtimes rather than governed in place.
   Governed MCP side effects are explicitly deferred (see `DEFERRED_WORK.md`).

5. **Future browser-session security is unresolved by design.** [DOCUMENTED_DECISION, ADR-005 /
   Gate B verdict] The Chrome bridge mechanism for browser-first execution remains intentionally
   unspecified — it does not block Gate C/D because browser automation itself is deferred. Don't
   assume a browser adapter exists or is safe to build without revisiting
   `docs/yusuf-os/gate-b/adapter-governance.md` §2 first.

6. **Git hooks / credential helper / textconv / fsmonitor risk — addressed, not eliminated by
   assumption.** [VERIFIED_BY_TEST, Gate D] Windows path handling, symlinks/junctions, protected-
   branch detection, remote identity/SHA-drift after approval, and option injection are all
   handled and have dedicated tests (`localGitPathEscape`, `localGitProcessHardening`,
   `localGitPushLifecycle`). Hooks are disabled via `core.hooksPath` pointed at an empty directory
   plus `--no-verify`; credential helper, external diff, textconv, and fsmonitor are neutralized
   via `-c` config overrides that take precedence over repository-local config for the life of
   each invocation — proven with an adversarial test that installs a hostile hook/diff/textconv
   script and confirms it never runs. Residual: this is Git-version-dependent behavior
   (`core.hooksPath` since 2.9, `GIT_CONFIG_GLOBAL` since 2.32); re-verify these adversarial tests
   if the server's Git version is ever pinned to something older, and re-run them after any Git
   upgrade rather than assuming they still hold.

7. **Protected-branch enforcement lives in two independent places, not one.** [DOCUMENTED_DECISION,
   Gate D] `YusufActionBoundary.bindTool` fixes one capability per bound tool at bind time, so the
   push request builder cannot dynamically re-route to `protected_branch.direct_push` inside a
   single bound tool without modifying the Action Boundary itself — which Gate D deliberately did
   not touch (see `DECISIONS.md`/`GATE_HISTORY.md`). The guarantee instead rests on (a) the
   request builder refusing to construct a protected-destination push intent at all, and (b) an
   independent test proving `protected_branch.direct_push`/`.force_push` are `FORBIDDEN` by
   Policy directly. If Gate E ever adds a *second* code path that builds `git.push_feature_branch`
   requests, it must re-derive both the source-branch and destination-branch protected checks —
   they are not enforced anywhere else in the pipeline.

8. **LocalGit's read capabilities support one revision at a time, not ranges.** [DOCUMENTED_DECISION,
   Gate D] `git.read_diff`/`git.read_log` accept a single validated revision expression (`HEAD`,
   `HEAD~1`, a branch name, a SHA) and deliberately reject range syntax (`a..b`, `a...b`) to keep
   the argument surface passed to Git small. If a future gate needs range diffs, extend
   `assertValidRevision`/the read builders deliberately rather than loosening the regex broadly.

9. **Push-transport partial-failure semantics are out of scope.** [DOCUMENTED_DECISION, Gate D]
   The adapter treats a `git push` exit code as either a clean atomic success or a clean
   rejection (non-fast-forward, unreachable remote); it does not model a transport that partially
   updates some refs and rejects others, which is unreachable in Gate D's local-filesystem-only
   remote but becomes relevant the moment a network transport (Gate E+) is introduced. Revisit
   `LocalGitAdapter.execute`'s `git.push_feature_branch` case before adding a network remote.

10. **Working tree has four uncommitted-to-remote local checkpoint commits.** [VERIFIED_FROM_REPOSITORY]
    Gate B, Gate C, Claude memory, and Gate D are each a separate local commit on
    `feature/yusuf-os-core`, none pushed. Not a security risk, but worth knowing before any
    destructive git operation — always `git status`/`git log` first, per the harness's own safety
    rules, and never push without Yusuf's explicit approval.
