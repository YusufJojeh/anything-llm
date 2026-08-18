# Known Risks

## Phase H (Browser Broker) risks — 2026-08-18

- **[MEDIUM] The CDP driver is unproven against a real browser.** `puppeteer-core` is not installed
  and no origin allowlist is configured, so every Phase H test runs on the fixture driver. The
  governance layer (origin policy, sanitizer, adapter) is genuinely exercised; the *attachment* code
  is not. Two specifics to check on first real use: `page.target()._targetId` is a private puppeteer
  field that may change across versions, and `Network.getCookies` behaviour should be confirmed to
  return only existence as assumed. Do not treat Phase H as field-proven until it has attached once.
- **[MEDIUM] Prompt injection is mitigated, not solved.** Hidden text is separated, injection
  phrasings are counted, and everything is stamped `UNTRUSTED_WEB_CONTENT` — but a sufficiently
  novel phrasing inside *visible* text will still reach a model as content. The real defence is that
  page content can never be authority: it cannot approve, change policy, assert identity or alter a
  prompt, and the Gate E output contracts reject authority-bearing model fields. The marker list is
  a signal, never a filter, and is commented as such so nobody later mistakes it for one.
- **[LOW] Origin allowlist is exact-host.** A legitimate subdomain (`gist.github.com`) must be
  listed explicitly. Deliberate: suffix matching is what lets `github.com.attacker.net` through.
- **[INFO] The broker is reachable but ungranted.** No Agent can invoke it yet because no role's
  code-owned allowlist contains a `browser.*` capability. This is intentional and test-enforced.


## Gate G (frontend) risks — 2026-08-18

- **[MEDIUM] A same-origin XSS anywhere in AnythingLLM could drive the Yusuf OS gateway.** The
  browser session cookie is httpOnly (unreadable from JS) and SameSite=Strict, and mutations need
  a CSRF token held only in the `/os` bundle's memory — so *cross-site* attacks are closed. But an
  attacker executing script on `localhost:3000` itself is same-origin and could both read that
  token from memory and ride the cookie. Mitigations in place: short idle expiry (30 min),
  absolute expiry (12 h), sessions are in-process only so a restart re-locks, an explicit Lock
  control, and no Yusuf OS surface uses `dangerouslySetInnerHTML`. This is an inherent property of
  putting *any* browser UI in front of the control plane and is now the main reason the AnythingLLM
  app's own XSS posture matters to Yusuf OS.
- **[LOW] The unlocked Command Center was never visually validated live.** Reaching it requires
  typing the control token into a browser field, which the implementing agent does not do.
  Everything below the unlock screen is proven by the 77 frontend tests and the 13 backend gateway
  tests, not by a rendered page. **Yusuf should do one manual pass** at 1440 / 1024 / 768 / 390,
  in Arabic, and with `prefers-reduced-motion: reduce`, before treating the visual layer as
  verified. Screenshots and viewport emulation were also unavailable in the session environment.
- **[LOW] The constellation's pointer hit-targets are not keyboard-reachable.** Deliberate: the
  synchronized `AgentRoster` list is the accessible equivalent and carries the same data,
  selection and actions. The SVG is `aria-hidden`. If the graph ever becomes the only place a
  capability lives, this stops being acceptable.
- **[LOW] `/os` is not behind AnythingLLM's `PrivateRoute`.** Deliberate — the Gate B contract is
  explicit that AnythingLLM's single-user auth is not valid authority for Yusuf OS. Reaching `/os`
  without a session shows only the unlock screen and fetches nothing.
- **[INFO] Gate F contract gap, now closed additively.** The dashboard emitted uuids while the
  detail routes accepted only numeric primary keys, so nothing on the dashboard was openable. New
  `/tasks/:id/detail`, `/runs/:id/detail` and `/approvals/:id/review` projections close it with a
  regression test; the numeric routes are unchanged.


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

## Added in Gate E (2026-08-17)

11. **Prisma's SQLite column-add rewrites the whole table and drops CHECK constraints.**
    [VERIFIED_BY_TEST, Gate E] Prisma does not model CHECK constraints, so its generated
    "RedefineTables" SQL silently loses Gate C's status/priority/principal-type/version
    constraints. Gate E hit this for real and hand-corrected the migration. **Any future gate that
    adds a column to an existing `yusuf_*` table must re-add every CHECK constraint by hand and
    verify with the regression test in `migrationSafety.test.js`** — never ship the generated SQL
    unread.

12. **Agent reasoning is not yet wired to a real LLM provider.** [DOCUMENTED_DECISION, Gate E]
    `ModelClient` is provider-agnostic with a `DeterministicModelClient` used by all core tests,
    so CI needs no API key and no network. The orchestration, security, and completion behavior
    are fully proven; what is *not* yet proven is a real model's ability to choose good
    capability calls. Wiring AnythingLLM's provider abstraction in is a later gate — and the
    security properties are designed to hold regardless of what the model emits.

13. **`startRun`'s concurrency check is read-then-transition, not atomic.** [VERIFIED_FROM_REPOSITORY,
    Gate E] Two truly simultaneous `startRun` calls for the same Agent could each observe
    `active < maxConcurrent` and both proceed, briefly exceeding the limit by one. The conditional
    transition still prevents double-starting the *same* run, and the current orchestration is
    sequential, so this is a consistency wrinkle rather than a security boundary. If Gate F+ adds
    parallel workers, make the limit atomic (e.g. a conditional update against a counter) rather
    than relying on the count query.

14. **Task ownership (`assignedAgentId`) follows the handoff, by design.** [DOCUMENTED_DECISION,
    Gate E] Gate C's `IntentService` requires the acting Agent to match the task's assigned Agent,
    so the Reviewer must genuinely own the task while reviewing it. Delegation *history* lives in
    `yusuf_handoffs`, not in `assignedAgentId`. Anything reading `assignedAgentId` must treat it as
    "who holds the task right now", not "who it was originally delegated to".

15. **Project command definitions are trusted configuration.** [DOCUMENTED_DECISION, Gate E]
    `yusuf_project_commands` rows supply the executable (from a code-owned allowlist) and argv.
    The model can only pick a semantic key. But a bad *registration* could still pass hostile argv
    (e.g. `node --experimental-loader=...`), so registering a command is an operator-trust action,
    equivalent to installing server code. `npm`/`npx`/`yarn` are deliberately excluded from the
    allowlist because on Windows they are `.cmd` shims that would require `shell: true`.

16. **Executing repository-authored code is inherently dangerous; Gate E constrains it rather than
    sandboxing it.** [VERIFIED_BY_TEST, Gate E post-review] `project.run_command` runs a real
    `node` process with the server user's privileges. Gate E prevents the obvious escalation
    (an Agent rewriting the script that gets executed) by requiring commands to name their scripts
    explicitly and forbidding writes to those paths. It does **not** sandbox the child: a command
    whose script was already malicious at registration time, or which `require`s a file the Agent
    *can* write, still runs unconfined. Registering a project command is therefore an
    operator-trust action equivalent to installing server code. A future gate wanting untrusted
    repositories must add OS-level isolation (separate low-privilege user or container with no
    read access outside the project root) or raise `project.run_command` to L3.

17. **`ProjectAdapter.preflight`'s freshness computation only binds on the approval path.**
    [VERIFIED_FROM_REPOSITORY, Gate E post-review] `preflight` computes a `resourceVersion` from
    the file's current digest, but `ExecutionCoordinator` only consumes `governedPreflight` when
    consuming an approval. `project.write_file` is L2/ALLOW, so its recomputed digest is never
    compared to anything — a concurrent edit is silently clobbered (last-writer-wins). No
    attacker-controlled consequence was identified, but do not rely on that preflight as a
    concurrency guarantee for L2 capabilities.

18. **Projection caches are process-local and reset on restart.** [DOCUMENTED_DECISION, Gate F]
    `adapterHealthCache` (10s TTL) and `auditCheckCache` live in module scope. A restart returns
    `chainStatus` to `UNCHECKED`, which is the intended fail-safe direction. If Yusuf OS ever runs
    multiple server processes, each will hold its own cache and the dashboard may disagree between
    them — move these to a shared store at that point rather than assuming coherence.

19. **The RFC 9457 problem+json error shape from Gate B §2 is not yet implemented.**
    [DOCUMENTED_DECISION, Gate F] The control plane still returns the Gate C envelope
    (`{error: {code, message, details, requestId}}`). Migrating would change a contract Gate C's
    tests assert, so it was deliberately deferred rather than done halfway. Do it as its own small
    change with the tests updated together, not as a side effect of a feature gate.
