# Gate C/D Acceptance-Test Specification

No test in this document calls GitHub or another external service. Git integration uses disposable local repositories and bare remotes created under the test temporary directory.

## 1. Test harness contract

Each test receives:

- a fresh temporary SQLite database with all upstream and Yusuf migrations applied;
- a deterministic clock and UUID/execution-key generator where necessary;
- fake LLM/runtime inputs;
- broker adapters that record invocations;
- a temporary working Git repository and optional bare `origin`;
- no inherited credentials or user environment;
- cleanup that resolves and verifies the temporary root before deletion.

The Git fixture automatically:

1. creates a bare remote;
2. creates a working repository;
3. configures test-local user name/email;
4. creates `main` and an initial commit;
5. adds the bare repository as `origin`;
6. creates feature branches as required;
7. verifies remote refs using Git plumbing commands;
8. never reads or modifies the real AnythingLLM `.git` directory.

## 2. Critical policy and approval tests

### AT-001 — L3 without approval has zero side effect

- Given `git.push_feature_branch` evaluates to `REQUIRE_APPROVAL`.
- When an Agent requests a push and no approval exists.
- Then Intent=`WAITING_APPROVAL`, Approval=`PENDING`, adapter invocation count=0, and bare remote ref is unchanged.

### AT-002 — Scheduled L3 suspends durably

- Given a scheduled run produces an L3 intent.
- When its worker reaches the Action Boundary.
- Then Task/Run/Intent/Approval are committed, Run=`WAITING_APPROVAL`, worker exits successfully without a live socket, and no adapter executes.

### AT-003 — Payload hash change invalidates approval

- Given Yusuf approved payload hash H1.
- When canonical payload changes to H2 before consumption.
- Then conditional consume affects zero rows, Approval/Intent become `INVALIDATED`, and no side effect occurs.

### AT-004 — Git SHA TOCTOU is blocked

- Given approval binds commit SHA A.
- When the local branch advances to SHA B.
- Then preflight reports changed resource version, re-policy invalidates approval, and remote remains unchanged.

### AT-005 — Equivalent CLI-to-browser fallback

- Given the semantic capability, target, payload, account and risk remain identical.
- When CLI becomes unavailable and browser is selected.
- Then a new ExecutionPlan is created, Policy re-evaluates equivalence, existing approval may remain valid, and audit records the fallback; no silent downgrade occurs.

### AT-006 — Account change invalidates

- Given approval expects safe account identity A.
- When adapter preflight detects B or unknown identity.
- Then execution is blocked and approval is invalidated or returned to explicit review according to policy.

### AT-007 — Concurrent double approval

- Given Approval version 1 is `PENDING`.
- When two requests approve version 1 concurrently.
- Then exactly one transition succeeds, the other returns `409 STATE_CONFLICT`, and only one audit decision event exists.

### AT-008 — Verified execution is idempotent

- Given intent has a verified receipt.
- When execute/resume is requested again.
- Then the existing receipt is returned and adapter invocation count remains one.

### AT-009 — Crash after possible effect

- Given adapter applies the remote push then the process dies before receipt commit.
- When the claim lease expires.
- Then state becomes `FAILED_UNKNOWN`; no automatic retry occurs; reconciliation observes the remote SHA and finalizes one verified receipt.

### AT-010 — Missing agent capability

- Given an Agent has no `git.push_feature_branch` capability.
- When it manually constructs a syntactically valid request.
- Then Policy returns `DENY`, no ApprovalRequest is created, and adapter invocation count=0.

### AT-011 — MCP server enabled does not authorize its tool

- Given an MCP server is enabled but one advertised tool has no capability mapping.
- When an Agent requests that tool.
- Then discovery may show it as unmapped, but execution is denied before `callTool`.

### AT-012 — Flow POST is governed

- Given a flow contains an HTTP POST.
- When the step executes without an authorized intent.
- Then the network adapter sees zero requests and the run waits/denies according to Policy.

### AT-013 — Imported skill trust boundary is honest

- Given an arbitrary in-process imported skill performs a module-load side effect.
- When it is classified `UNTRUSTED_OR_UNKNOWN`.
- Then Yusuf governed Agents cannot load it; documentation/UI never claims broker containment. A separate test proves handler wrapping alone cannot prevent module-load effects.

### AT-014 — Symlink/junction escape denied

- Given an allowlisted project contains a link resolving outside the root.
- When an Agent requests a write/commit through that path.
- Then canonical path validation denies before filesystem mutation.

### AT-015 — Protected branch push forbidden

- Given target is configured protected `main`.
- When any principal requests direct or force push.
- Then Policy=`FORBIDDEN`, no normal approval exists, and no adapter executes.

### AT-016 — Secret output redacted

- Given command output contains test tokens, auth headers, cookie formats, private-key markers and `.env` values.
- When output passes adapter normalization.
- Then forbidden bytes appear in neither model context, receipt, audit, trace, API nor SSE; only redaction metadata/counts persist.

### AT-017 — Audit-chain tampering detected

- Given a valid chain of at least three events.
- When a middle event is changed, removed, or reordered in a test DB copy.
- Then integrity verification fails at the first affected sequence and system status becomes degraded.

## 3. Forbidden and identity tests

| ID | Scenario | Required assertion |
|---|---|---|
| AT-018 | Agent requests cookie/session export | `FORBIDDEN`; no approval; no adapter |
| AT-019 | Agent requests private key or raw `.env` | `FORBIDDEN`; no captured evidence |
| AT-020 | Agent requests Policy mutation | `FORBIDDEN`; only authenticated USER admin service can mutate policy |
| AT-021 | Agent requests Approval/Audit mutation | `FORBIDDEN`; immutable security history remains unchanged |
| AT-022 | System component forges USER approval | rejected principal type; security alert event |
| AT-023 | Approval decision submitted without fail-closed auth | 401/403; no transition |
| AT-024 | Mutation requested from non-loopback source | rejected before handler; no DB change |
| AT-025 | L4 wildcard/always-allow request | validation/policy rejection |

## 4. State-machine and concurrency tests

Generate table-driven tests for every legal transition and every other source/target pair as illegal.

Additional cases:

- expiry races approval decision;
- approval revoked before consumption;
- revoke after consumption fails without pretending to undo effect;
- policy version changes between approval and execution;
- resource version changes without payload change;
- ExecutionPlan expires before claim;
- two workers claim the same authorized intent;
- two reconcilers finalize the same unknown action;
- stale UI decision uses old intent or approval version;
- cancellation before execution succeeds; cancellation during uncertain execution does not claim no effect;
- audit append failure rolls back critical state transition.

Expected invariant: exactly one legal winner where concurrency competes; no path creates two external invocations for one intent.

## 5. LocalGit and CLI tests

| ID | Scenario | Required assertion |
|---|---|---|
| AT-030 | Read status/diff/log in allowlisted fixture | L0/L1 and sanitized output |
| AT-031 | Create feature branch | L2; branch prefix/source SHA enforced |
| AT-032 | Local commit scoped files | L2 default; staged digest and parent SHA recorded |
| AT-033 | Project policy upgrades local commit | Approval required; zero commit before decision |
| AT-034 | Commit touches protected path | denied/forbidden according to rule |
| AT-035 | Push feature branch | approval binds remote/branch/SHA; bare ref verified |
| AT-036 | Remote branch advances after approval | preflight conflict; no force/update |
| AT-037 | Raw shell metacharacters in argument | passed as inert argv or rejected; never interpreted |
| AT-038 | Unregistered binary | denied even if installed |
| AT-039 | Inherited secret environment | child receives only registered allowlist |
| AT-040 | Timeout/output limit | process tree cancelled; output bounded/redacted; mutation uncertainty classified |
| AT-041 | Working-directory traversal/case/junction escape | denied after canonical resolution |

## 6. MCP, network flow, and SQL tests

### MCP

- capability mapping required per tool;
- schema digest change disables mapping pending review;
- child environment contains only allowlisted keys;
- tool output is untrusted, schema-validated and redacted;
- hidden/unverifiable high-impact effect remains unavailable or `FAILED_UNKNOWN`.

### Governed network/Agent Flow

- deny non-HTTPS except explicitly registered local origins;
- deny loopback/private/link-local/metadata destinations by default;
- re-check every redirect and DNS resolution;
- deny cross-origin credential forwarding;
- enforce request/response size, timeout and method policy;
- GET with a mutating semantic capability is not auto-classified read-only;
- POST/PATCH/DELETE cannot bypass Action Boundary.

### SQL

- reject multiple statements, comments used to hide a second statement, DML, DDL, transaction control, attach/load extension and dialect-specific side effects;
- allow only supported parsed read queries;
- prove driver credentials cannot mutate the test datasource;
- enforce timeout, row and byte limits;
- redact sensitive result columns according to datasource policy;
- unsupported/ambiguous dialect fails closed.

## 7. API/auth/realtime tests

- Yusuf mutations fail startup or requests fail closed when auth config is incomplete.
- UI route checks never substitute for backend authorization.
- malformed body, unknown fields, oversized body, stale versions and invalid IDs return stable problem codes.
- resource lookup does not leak unauthorized existence.
- approval decision never accepts client idempotency/execution keys.
- SSE authorization matches snapshot authorization.
- duplicate events apply once.
- out-of-order/gap/unknown-version/expired-cursor triggers snapshot reconciliation.
- reconnect and tab visibility restore reconcile state.
- UI cannot display `APPROVED` as `VERIFIED`.
- no secret-bearing payload appears in API/SSE projections.

## 8. Frontend/accessibility contract tests for later gates

- keyboard-only navigation reaches constellation-equivalent agent list and all approval controls;
- modal/full-page approval traps and returns focus and exposes labelled title/description;
- realtime updates use bounded announcements and never steal focus;
- risk/state meaning remains available without color or motion;
- Arabic RTL changes root direction, logical layout, icons and bidi isolation correctly;
- 200% zoom and narrow/mobile layouts reflow without page-level horizontal scrolling;
- reduced-motion removes constellation animation;
- forced-colors preserves focus and state boundaries;
- AccessLint scan/diff/audit and automated axe checks pass agreed baselines;
- manual screen-reader, keyboard, focus, zoom, RTL and touch-target review is recorded.

## 9. Gate C and Gate D pass criteria

Gate C cannot pass unless mandatory dispatch, policy/approval persistence, state transitions, audit-chain integrity, fail-closed control auth, and negative bypass tests are green on temporary SQLite.

Gate D cannot pass unless the disposable Git fixture proves inspect → branch/write/check/commit → approval → push → independent remote-ref verification, including SHA race, concurrency, crash/reconcile, protected branch, path escape and secret redaction cases without external network access.

