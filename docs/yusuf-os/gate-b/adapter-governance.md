# Adapter Governance

## 1. Common adapter rules

An adapter is an execution mechanism, never an authorization authority.

Every adapter must:

- advertise typed capabilities and versions;
- report availability and non-secret account identity;
- accept broker-prepared structured input only;
- receive a minimal explicit environment/credential scope;
- perform preflight immediately before execution;
- expose verification and reconciliation methods;
- redact output before persistence or LLM visibility;
- never call Approval or Policy storage directly;
- never silently broaden target, permissions, or business effect.

Fallback is allowed only when re-policy confirms semantic equivalence. A changed account, target, resource version, permission scope, payload, or risk invalidates authorization as appropriate.

## 2. Browser-session contract

Browser-First means preference for Yusuf's existing user-controlled authenticated Chrome session.

The future governed bridge must:

- attach with explicit user opt-in to the current session;
- never copy/export cookies, tokens, passwords, credential-store data, or profile files;
- expose only safe account/origin metadata;
- allowlist origins and capability-specific navigation;
- separate observation, form preparation, and submission;
- create a new preflight snapshot immediately before an external mutation;
- translate semantic actions into typed operations rather than exposing raw CDP/JavaScript;
- capture only policy-allowed screenshots/evidence with configured retention;
- provide visible session/adapter status and an emergency stop;
- fail closed when page/account/target identity cannot be established.

Conceptual interface:

```ts
interface GovernedBrowserBridge {
  availability(): Promise<AdapterAvailability>;
  observe(ref: BrowserResourceRef): Promise<SanitizedPageState>;
  prepare(intent: ActionIntent): Promise<BrowserPreparedAction>;
  preflight(action: BrowserPreparedAction): Promise<PreflightResult>;
  execute(action: BrowserPreparedAction, claim: ExecutionClaim): Promise<AdapterExecutionResult>;
  verify(intent: ActionIntent): Promise<VerificationResult>;
}
```

Typing may be L2 when it has no submission effect. Enter, submit, send, publish, apply, delete, purchase, permission grant, or equivalent clicks are L3/L4 or `FORBIDDEN` by semantic capability—not DOM element name alone.

An isolated browser/profile is future explicit opt-in fallback. Open Computer is deferred and is not in the first slice.

## 3. LocalGit adapter contract

### Capability catalog

| Capability | Default | Preconditions |
|---|---|---|
| `git.inspect_repository` | L0 | repository allowlisted |
| `git.read_diff` | L0/L1 | paths inside repository |
| `git.create_feature_branch` | L2 | valid branch prefix; source revision pinned; not protected |
| `filesystem.write_project_file` | L2 | resolved path inside project root; protected/secret paths denied |
| `project.run_declared_check` | L2 | exact command registered by project policy |
| `git.commit_local` | L2 | allowlisted repository; unprotected branch; scoped paths; no secret/protected files; project may tighten |
| `git.push_feature_branch` | L3 | exact repo, remote, branch, commit SHA and account constraint |
| `git.create_pull_request` | L3 | pushed head SHA and approved base/target |
| `git.push_protected_branch` | FORBIDDEN | none |
| `git.force_push_protected_branch` | FORBIDDEN | none |

### Repository identity

Canonical repository identity includes resolved real path plus a stable repository marker and configured remote identity. Path comparison is case-aware according to the host filesystem. The adapter re-resolves real paths after opening handles where practical.

### Local commit invariants

- repository is project-allowlisted;
- current branch is not protected;
- changed files resolve inside project root;
- symlinks/junctions do not escape the root;
- protected paths such as `.env`, credential stores, private keys, policy/approval/audit stores are denied;
- staged diff digest and parent SHA are recorded;
- commit command uses argument arrays, not shell strings;
- project policy may raise the action to L3.

### Push intent

Canonical payload binds:

```text
capability = git.push_feature_branch
repositoryId
remoteIdentity
remoteBranch
expectedLocalCommitSha
expectedRemoteBeforeSha or absent-branch condition
force = false
accountConstraint when safely detectable
```

Verification queries the bare/remote ref and confirms it equals the approved commit SHA. A changed local SHA after approval invalidates execution.

## 4. CLI Broker contract

The CLI Broker is a registry of typed commands, not a shell.

```ts
interface TypedCommandDefinition {
  key: string;
  executableIdentity: string;
  argumentSchemaRef: string;
  allowedWorkingRootKinds: string[];
  environmentAllowlist: string[];
  timeoutMs: number;
  maxStdoutBytes: number;
  maxStderrBytes: number;
  exitCodePolicy: number[];
  redactionProfile: string;
  mutability: "READ" | "LOCAL" | "EXTERNAL" | "DESTRUCTIVE";
}
```

Rules:

- resolve executable from trusted registration/known path and verify identity where practical;
- use process argument arrays without shell mode;
- no pipes, redirects, command substitution, wildcard expansion, or model-provided environment names;
- resolve/allowlist cwd and all path arguments;
- minimal environment assembled per command;
- bounded output, timeout, cancellation, and process-tree termination;
- redact before logs, receipts, and LLM consumption;
- availability checks do not authorize execution.

Initial families: `git`, authenticated `gh` when available, scoped filesystem primitives, and project-declared test/lint/build commands. Docker, npm, PHP/Composer, Python, Vercel, AWS, and others require separate typed registration.

## 5. MCP governance

MCP discovery and authorization are separate.

- Enabling a server permits discovery only.
- Each MCP tool maps to one or more versioned Yusuf capabilities.
- Unmapped tools are unavailable to governed Agents.
- Tool arguments are canonicalized before Policy.
- Execution crosses the same Broker and Receipt path.
- MCP results are untrusted tool output and pass schema validation/redaction.
- Child processes receive a deny-by-default environment allowlist; the broad parent environment is never inherited.
- Server package/command/config changes invalidate trust registration.
- MCP server identity, version, transport, executable/URL digest, and tool schema digest are recorded.
- Network MCP transports use origin/TLS/auth policies and bounded timeouts.

Residual risk: an authorized MCP process may perform hidden effects beyond its declared tool result. High-impact MCP capabilities require isolation or independent verification; sensitive MCP servers may remain disabled.

## 6. Imported-skill trust decision

Arbitrary imported Node skills are not Yusuf OS Core governed extensions.

Reason: loading code with in-process `require()` allows module-load and direct filesystem/network side effects that an action wrapper cannot contain.

Initial classifications:

- `TRUSTED_LOCAL_CODE`: explicitly installed and reviewed by Yusuf/operator outside agent policy; equivalent to installing server code. It may contribute pure planning/formatting functions but does not gain Yusuf action authority automatically.
- `GOVERNED_EXTENSION`: reserved for a future isolated process/sandbox protocol whose operations still cross the Broker.
- `UNTRUSTED_OR_UNKNOWN`: unavailable to Yusuf agents.

The product must never claim that imported in-process JavaScript is contained by Action Broker.

## 7. Agent Flow and network governance

Every flow step is classified and intercepted. Existing arbitrary API-call blocks cannot remain an execution backdoor.

Governed network capability requires:

- schemes restricted to `https` by default; explicit localhost exceptions for registered local services;
- canonical origin/host allowlist;
- DNS resolution and redirect destination checks;
- private, loopback, link-local, multicast, and cloud metadata ranges denied unless an exact local capability explicitly permits them;
- redirect count and cross-origin redirect policy;
- method-specific risk classification;
- request/response size limits and timeouts;
- header allowlist and authorization-header isolation;
- no userinfo credentials in URLs;
- response content-type/schema checks;
- redaction before persistence or model visibility.

GET is not automatically read-only: URLs may trigger effects, leak data, or reach internal services. Policy is capability/target based.

## 8. SQL governance

Prompt text is never a SQL security boundary.

The initial governed SQL adapter is optional and read-only only. It requires layered controls:

1. database credentials restricted to read-only privileges where supported;
2. driver/connection read-only transaction mode where supported;
3. exactly one parsed statement;
4. parser/classifier accepts an allowlist of query forms;
5. mutation, DDL, transaction control, attach/load-extension, file/network functions, and engine-specific side-effect constructs denied;
6. parameters separated from SQL text where applicable;
7. query timeout, row limit, byte limit, and cancellation;
8. result redaction and sensitivity policy;
9. audit of datasource identity and query digest, not secrets.

Keyword checks alone are insufficient and are only defense-in-depth. Parser coverage varies by dialect; unsupported or ambiguous syntax fails closed. Read-only credentials remain essential because parsers can be incomplete.

## 9. Adapter account identity

Preflight reports safe identity metadata only:

```text
authenticated
provider
safe account label or provider identifier
origin
granted capability summary
availability
```

It never returns tokens, cookies, auth headers, private keys, credential file contents, or raw environment values.

Before external mutation, Policy compares detected identity/origin to the intent's approved account constraint. A changed or unknown identity causes re-policy and normally invalidation, never silent fallback.

