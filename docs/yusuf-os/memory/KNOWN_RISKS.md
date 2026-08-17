# Known Risks

Carried from Gate C's residual-risk record, re-assessed 2026-08-17. None are P0/P1 as of this
session — treat as things to watch, not things to unprompted-fix.

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

6. **Future Git hooks / credential helper / textconv risk (Gate D).** [PLANNED — from handoff]
   Not yet relevant because no LocalGit adapter exists yet, but flagged for when Gate D starts:
   Windows path handling, symlinks/junctions, nested repos, protected-branch detection, remote
   identity/URL-change-after-approval, HEAD/SHA drift after approval, shell/option injection,
   Git hooks, external diff/textconv, fsmonitor, credential helpers, child-process environment
   leakage, secret files in the working tree. See `CURRENT_GATE.md`.

7. **Working tree has uncommitted Gate C changes.** [VERIFIED_FROM_REPOSITORY] As of this
   session, all the Gate C modifications are unstaged/untracked in the working tree, not
   committed. Not a security risk per se, but worth knowing before running any destructive git
   operation — always `git status` first, per the harness's own safety rules.
