# Known Risks

## `/os` Jarvis redesign risks — 2026-09-29

- **[MEDIUM] Live microphone behaviour is unproven.** Amplitude mapping was validated only with a
  Chromium fake capture device playing a WAV fixture (browser AGC was active). Real voices,
  Safari/iOS AudioContext policies and Bluetooth mics still need Yusuf's hands-on check.
- **[LOW] Performance was measured under software rendering.** Idle main-thread ≈2–4% in headless
  Chromium/SwiftShader (0 layouts/s with WebGL on); real-GPU numbers not measured.
- **[LOW] Mobile focus order follows DOM (needs → agents → core …) while phones show the Core
  first via CSS `order`.** Deliberately left; revisit if keyboard use on phones matters.
- **[INFO] Command transcript is tab-memory only** — there is no chat-history projection.

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

5. **[SUPERSEDED, reworded 2026-09-06] Browser-session security — the governed bridge contract is
   now substantially built, not unresolved.** [VERIFIED_FROM_REPOSITORY] This item originally
   predated Phase H/I and described the Chrome bridge as intentionally unspecified. It no longer is:
   the `docs/yusuf-os/gate-b/adapter-governance.md` §2 contract (explicit opt-in, never copy
   cookies/tokens, allowlist origins, separate observe/prepare/submit, preflight-immediately-before-
   mutation, typed operations not raw CDP, fail closed on identity mismatch) is implemented in
   `BrowserAdapter.js`, `CdpBrowserDriver.js`, `formRegistry.js`, and `mutationGuards.js`, and has
   been independently reviewed clean across Phases H, I, and X. The genuinely-still-open residual is
   narrower and already tracked elsewhere: item 1 above ("CDP driver is unproven against a real
   browser") and `HUMAN_ACTION_REQUIRED.md` item 2 (Browser Broker attachment opt-in). Treat those
   two as the current open browser-security items, not this one.

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

10. **[COUNT CORRECTED 2026-09-06] Working tree has local commits not on the remote.** [VERIFIED_FROM_REPOSITORY]
    `git rev-list --left-right --count origin/feature/yusuf-os-core...feature/yusuf-os-core` now
    reports local ahead 48, behind 1 — not "four" as originally recorded right after Gate D. The
    exact count will keep drifting session to session; re-derive it with that command rather than
    trusting any number written here. The underlying caution is unchanged and still the point of
    this entry: not a security risk, but always run `git status`/`git log` first before any
    destructive git operation, and never push without Yusuf's explicit approval.

## Added in Gate E (2026-08-17)

11. **Prisma's SQLite column-add rewrites the whole table and drops CHECK constraints.**
    [VERIFIED_BY_TEST, Gate E] Prisma does not model CHECK constraints, so its generated
    "RedefineTables" SQL silently loses Gate C's status/priority/principal-type/version
    constraints. Gate E hit this for real and hand-corrected the migration. **Any future gate that
    adds a column to an existing `yusuf_*` table must re-add every CHECK constraint by hand and
    verify with the regression test in `migrationSafety.test.js`** — never ship the generated SQL
    unread.

12. **[SUPERSEDED, reworded 2026-09-06] Agent reasoning's production default is already the real
    provider-routed client — only a live round-trip is unproven.** [VERIFIED_FROM_REPOSITORY] This
    item's original "not yet wired to a real LLM provider" framing is stale: as of Phases R/T,
    `AgentReasoningLoop.js` constructs `this.modelClient = modelClient || new RoutedModelClient()` —
    the production default already routes to a real provider (Ollama/OpenAI via `ModelRouter`).
    `DeterministicModelClient` is only ever injected by tests, for determinism, not the production
    path. The genuinely-still-open piece — a real model actually completing a live reasoning
    round-trip — is already tracked precisely in `HUMAN_ACTION_REQUIRED.md` (the live Ollama/OpenAI
    model runtime item). Treat that as the current open item, not this one.

13. **[FIXED 2026-09-05, commit `2566344c`] `startRun`'s concurrency check was read-then-transition,
    not atomic.** [VERIFIED_BY_TEST] Originally flagged in Gate E: two truly simultaneous `startRun`
    calls for the same Agent could each observe `active < maxConcurrent` and both proceed, briefly
    exceeding the limit by one. A CAVEMAN AUDIT background review confirmed this was live (not just
    theoretical) once Gate F+ introduced concurrent callers. Fixed by wrapping the count and the
    QUEUED→RUNNING `conditionalTransition` inside one `db.$transaction`, using SQLite's
    single-writer serialization for atomicity — the same pattern `ExecutionCoordinator`'s claim
    transaction already used. Regression test: "two different queued runs for the same agent cannot
    both pass the concurrency cap" in `agentReasoningLoop.test.js`.

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

## CAVEMAN AUDIT findings — 2026-09-05

Four independent background-agent audits (security kernel, Browser Broker/voice, domain
verticals/scheduler, agent runtime/reasoning loop) ran against the current tree. Real, locally
fixable findings were fixed with regression tests and committed (see `GATE_HISTORY.md` for the
full list — TOCTOU in `AgentRunCoordinator.startRun`, `ExecutionCoordinator` prepare()-failure
misclassified as `FAILED_UNKNOWN`, unbounded recursion depth in canonicalization/redaction,
`CdpBrowserDriver.readPageState()` unbounded hang, raw notification-kind enum leaking into `/os`
UI text, stale `run.task.evidence` snapshot rejecting a legitimate self-cited `COMPLETE`). The
following were found and deliberately **not** fixed this session, per `CLAUDE.md`'s "never
refactor stable security-critical code without necessity" and the governing audit's "do not
automatically redesign schema":

20. **[MEDIUM, KEEP_DEFERRED] No `busy_timeout` is configured on the shared SQLite connection —
    production or test.** [VERIFIED_FROM_REPOSITORY] Both `server/utils/prisma/index.js` (the
    production Prisma client) and `server/__testUtils__/yusufOS/testDatabase.js` (the test harness)
    use Prisma's SQLite connector via the experimental `node:sqlite` driver with no `busy_timeout`
    PRAGMA set anywhere. Under genuine concurrent `$transaction` calls this surfaces as a raw
    `PrismaClientUnknownRequestError` / `ConnectorError("Timed out during query execution.")`
    instead of either a graceful queue or a clean application-level error — reproduced directly by
    this session's own concurrency regression tests, which had to relax their assertions to "one
    caller wins, one fails" rather than asserting a specific error shape for the loser. This is a
    pre-existing, upstream-shared infrastructure gap (not introduced by any Yusuf OS code), and its
    blast radius is broader than any single fix in this session's scope — every `$transaction`
    caller across the whole domain would need to either tolerate this error shape or the client
    needs a `busy_timeout` PRAGMA set once at connection time. Fix as its own deliberate change
    (`PRAGMA busy_timeout = <n>` on the shared client), with its own tests, not as a side effect of
    an unrelated fix.
21. **[LOW, KEEP_DEFERRED] ALLOW-path (auto-approved, non-approval-gated) capability calls have a
    theoretical TOCTOU window analogous to the fixed `startRun` race.** [VERIFIED_FROM_REPOSITORY,
    security-kernel audit] Not exercised by a failing test and not confirmed to have a live
    concurrent caller today (unlike `startRun`, which Gate F+ orchestration does call concurrently).
    Documented as a watch item, not fixed, to avoid touching stable `ExecutionCoordinator`/Policy
    code without a proven live reproduction.
22. **[LOW, KEEP_DEFERRED] Audit-checkpoint contention under concurrent writers.** [VERIFIED_FROM_REPOSITORY,
    security-kernel audit] `AuditService`'s hash-chain append (`previousHash` read-then-write) has
    the same class of read-then-write window as the fixed `startRun` race, but audit appends are
    already serialized in practice by every caller going through `ExecutionCoordinator`'s own
    transaction boundaries; no live concurrent-writer path to `AuditService.append` independent of
    those boundaries was found. Watch item, not fixed.
23. **[SAFE_TO_FIX_NOW, but deferred per schema-change rule] DB `CHECK` constraints on newer tables
    have the same Prisma "RedefineTables drops CHECK constraints" exposure documented in risk #11.**
    [VERIFIED_FROM_REPOSITORY, domain-verticals audit] Not applied this session because it requires
    a migration touch, and the governing audit's Section 3 instruction is explicit: "do not
    automatically redesign schema." Apply alongside the next migration that already needs to touch
    the affected tables, re-verifying with `migrationSafety.test.js`, rather than as a standalone
    schema change.
24. **[LOW, KEEP_DEFERRED] `ChiefOfStaff` has no compensation path if a downstream step fails after
    a handoff is recorded.** [VERIFIED_FROM_REPOSITORY, agent-runtime audit] No live call site
    reaches the affected path today (confirmed by the auditing agent), so there is no reproducible
    failure to write a regression test against. Documented for whichever future phase adds the
    call site that would make this reachable.

A fresh independent review (an agent with no memory of the reasoning above, re-reading all six
diffs cold plus their surrounding non-diff code) confirmed all six fixes SOUND with genuinely
failing-before/passing-after regression tests, and surfaced two additional non-exploitable notes:

25. **[P2, COSMETIC] Notification-kind i18n has no explicit null/undefined guard.** [VERIFIED_BY_TEST]
    `AttentionQueue.jsx`'s translation lookup assumes `item.values.notificationKind` is always a
    string; the one production caller (`buildAttentionQueue` in `commandCenterModel.js`) always
    sets it for every `NOTIFICATION`-kind item, so this cannot happen via the current data path.
    If a future backend change ever emits `kind: null`, the label degrades to blank/`"undefined"`
    rather than a raw-string fallback — worth a defensive default if that emission path is ever
    added, not urgent today.
26. **[P2, DESIGN NOTE] `AgentReasoningLoop`'s COMPLETE-decision evidence re-query (commit `c2b8a909`)
    is scoped by `taskId`, not `runId`** — evidence from a *different* run of the same task is
    citable in a completion. [VERIFIED_FROM_REPOSITORY] This is **not a regression**: the pre-fix
    code read `run.task.evidence` via the same task-scoped Prisma `include`, and `#reviewContext`
    elsewhere in the file uses the identical task-scoped pattern — the fix reproduces existing
    scoping semantics, just freshly rather than staleness. Whether completion evidence *should* be
    run-scoped instead of task-scoped is a real design question, but it predates this session and
    is out of scope for a bug fix commit; raise it if a future phase revisits evidence semantics.
