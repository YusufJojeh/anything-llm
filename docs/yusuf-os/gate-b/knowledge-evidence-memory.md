# Phase J — Knowledge / Evidence / Memory split

Status: implemented this phase. Written before the code, per the same discipline as
`organization-model.md`. Implements ADR-008 (`adrs/ADR-008-knowledge-evidence-and-secrets.md`),
which was accepted at Gate B but never built.

## Problem

ADR-008 draws three lines that don't exist yet in running code:

1. **Evidence** (`yusuf_run_evidence`, built at Gate E) has no classification and no retention. Every
   row lives forever at the same trust level, which the ADR calls out as wrong: a screenshot and a
   sanitized stdout summary are not the same risk.
2. **Knowledge** — durable, citable facts an Agent has learned and wants to reuse across tasks —
   does not exist. Nothing distinguishes it from upstream AnythingLLM's RAG documents
   (`workspace_documents`/`document_vectors`, vector-DB backed, namespaced by `workspace.slug`) or
   from raw conversational transcript.
3. **Memory** — small scoped facts ("this project's test command is X") — does not exist either,
   and must not be confused with upstream's unrelated personalization `memories` model
   (`userId, workspaceId, scope, content, lastUsedAt` — a different feature for a different
   product surface).

## What this phase is

- Retention/classification added to the existing Evidence table (additive columns, no new table).
- Two new governed capability pairs: `knowledge.read`/`knowledge.write` and
  `memory.read`/`memory.write`, following the exact `definition()` pattern in
  `capabilities/registry.js`.
- Two new Prisma tables: `yusuf_knowledge_entries`, `yusuf_memory_entries`.
- The first governed adapter whose "external effect" is a Prisma write rather than a
  filesystem/git/browser side effect (see "New adapter class" below).
- Real grants: Engineering gets `knowledge.write` + `memory.read` + `memory.write`; Reviewer gets
  `knowledge.read`. This is a deliberate departure from Phase H/I's "reachable, not yet granted"
  pattern — Yusuf asked for a full vertical slice, and there is no external-system risk here to
  wait on (unlike a real browser or a real push), so there is no reason to leave it ungranted.

## What this phase is not

- Not a vector store. Knowledge entries are structured, curated, small (title + body + citation),
  written deliberately by an Agent — not an automatic ingestion pipeline, not chunked, not
  embedded. If Yusuf later wants semantic search over Knowledge, that's a new phase that can added
  a vector index without changing this table's meaning.
- Not a replacement for `workspace_documents`. Uploaded documents keep working exactly as they do
  today; nothing here reads or writes that table.
- Not a replacement for upstream `memories` (personalization). That model is untouched.
- Not a scheduled retention sweep. `tombstoneExpiredEvidence()` is written as a plain function
  Yusuf (or a future scheduled job, itself going through the boundary if it ever needs to) can call;
  wiring a cron trigger is a separate, later decision — this phase proves the mechanism, not the
  schedule.
- Not a new HARD_FORBIDDEN concept. `SECRET_FORBIDDEN` evidence is rejected at write time by a plain
  validation check in the same place all evidence is written (`AgentRunCoordinator.recordEvidence`),
  the same way `project.write_file`'s size limit is a validation check, not a policy decision.

## Evidence: classification + retention

`yusuf_run_evidence` gains three additive, nullable-safe columns:

- `evidenceClass` (`String`, default `"SANITIZED_OUTPUT"`) — one of ADR-008's five classes.
- `expiresAt` (`DateTime?`) — computed at write time from a code-owned
  `EVIDENCE_RETENTION_DAYS` map in `constants.js`, one entry per class. `PUBLIC_METADATA` retains
  longest, `SCREENSHOT` shortest — mirrors the ADR's ordering rationale (least sensitive survives
  longest, most sensitive expires soonest).
- `tombstonedAt` (`DateTime?`) — set once retention expires and the row is truncated.

`SECRET_FORBIDDEN` is a valid enum value for classification purposes but `recordEvidence()` throws
if passed it — the class exists so the write path can affirmatively refuse it and say why, not so
anything is ever actually stored at that class. This matches ADR-008 literally: "Secrets ...
are never persisted," which is a refusal, not a retention policy of zero.

`tombstoneExpiredEvidence(db, { now })` (`evidence/EvidenceRetention.js`) finds rows past
`expiresAt` with `tombstonedAt` still null, and for each: overwrites `summary` and `payload` with a
fixed tombstone marker, keeps `digest`/`evidenceClass`/`kind`/`runId`/`taskId` untouched (the audit
trail keeps knowing *that* something happened and *what class* it was, never *what* it said), sets
`tombstonedAt`, and writes one `EVIDENCE_TOMBSTONED` audit event per row via the existing audit
writer. This is a pure data-layer operation with no policy/approval step — it deletes/redacts data
Yusuf's own system already owns and already decided (by class) how long to keep, which is exactly
the kind of operation Gate C's own precedent (`AgentRunCoordinator` writing evidence directly,
ungoverned) already treats as below the Action Boundary's threshold. It does not touch anything
external, is not agent-invokable, and is not a capability.

## Knowledge

New table `yusuf_knowledge_entries`:

```
id, uuid, title, body, sourceType (AGENT_DERIVED|USER_PROVIDED|DOCUMENT_CITED),
sourceRef (String?, e.g. a file path or URL the fact came from),
tags (String, JSON array, default "[]"),
createdByAgentId (Int?, FK -> yusuf_agents), createdByPrincipalType (String, "AGENT"|"USER"),
createdAt, updatedAt
```

`knowledge.write` (`operationClass: LOCAL_WRITE`, `defaultRisk: L1`, `defaultOutcome: ALLOW`,
`mutation: true`, `verificationRequired: true`, `idempotency: SERVER_KEY`) — modeled directly on
`project.write_file`: an internal-only mutation with no external blast radius, so it does not need
approval, but it does need independent verification (the adapter re-reads its own write by uuid
rather than trusting the value it just inserted, same principle as `ProjectAdapter.verify()`
re-reading the file from disk).

`knowledge.read` (`operationClass: READ`, `defaultRisk: L0`, `defaultOutcome: ALLOW`) — list/get by
tag or uuid.

## Memory

New table `yusuf_memory_entries`:

```
id, uuid, scope (PERSONAL|PROJECT|AGENT|TASK|CONVERSATION), scopeRef (String?),
key, value (String, JSON), createdByAgentId (Int?), createdByPrincipalType,
createdAt, updatedAt
@@unique([scope, scopeRef, key])
```

The unique constraint makes a write an upsert by construction: writing the same
`(scope, scopeRef, key)` twice updates in place rather than accumulating duplicate rows, which is
also what makes `idempotency: SERVER_KEY` true rather than aspirational — a retried execution
produces the same row, not a second one.

**Scope access control is the actual security content of this phase**, enforced in
`adapters/memory/scopeIdentity.js`, called from `MemoryAdapter.preflight()`/`prepare()` — the
request builder cannot perform this check itself because it only sees the model's raw arguments,
not the acting Agent/task identity; that identity lives on the intent row (`agentId`, `taskId`,
`requestedByPrincipalType`), which only the adapter receives. This mirrors
`assertRepositoryMatchesTask`'s placement for git/project capabilities — also adapter-side, also
checked at both `preflight()` and `prepare()` as defense in depth around the framework's live
recheck:

- `PERSONAL` scope can only be written/read by a `USER` principal. No Agent-bound toolset can ever
  reach it — `buildMemoryRequest` throws `SCOPE_FORBIDDEN_FOR_AGENT` if an agent-run context asks
  for `PERSONAL`. This is a hard rule enforced in code, not a grant that happens to be unused yet.
- `AGENT` scope requires `scopeRef` to equal the acting Agent's own id — an Agent cannot read or
  write another Agent's `AGENT`-scoped memory. Checked against `runtimeContext.agentId`.
- `TASK`/`CONVERSATION` scope requires `scopeRef` to equal the task/conversation the current run is
  actually bound to (`runtimeContext.taskId`) — an Agent cannot read another task's memory by
  guessing its id.
- `PROJECT` scope requires `scopeRef` to be a project id the acting Agent's current task is actually
  bound to (checked via the task's `projectId`, the same relation `repositoryIdentity.js` already
  uses for git/project capabilities) — not an arbitrary project id supplied by the model.

This lives entirely inside the request builder, which is the same place Phase D/I already put this
class of check (`assertRepositoryMatchesTask`, `formRegistry.resolveForm`) — it is deliberately not
a new PolicyEngine rule, so the "Department/AutonomyLevel never reach PolicyEngine" invariant from
the Organization model phase has a direct analogue here: **scope identity is a request-shape
concern, resolved before Policy ever sees an intent, not a policy decision.**

## New adapter class: Prisma-mutation-as-external-effect

No adapter before this phase has had an "external effect" that is itself a write to Yusuf OS's own
database — Evidence writes happen directly from `AgentRunCoordinator`, ungoverned, and every
existing adapter (LocalGit/Project/Browser) wraps a side effect *outside* the Prisma schema. Two
options were considered:

1. Treat Knowledge/Memory writes the same as Evidence — a plain domain-service call, no Intent, no
   Policy, no Audit-as-mutation.
2. Route them through the full boundary like every other mutation.

**Decision: option 2.** Evidence recording is system-authored narration *about* a run the boundary
already approved (the run's actions were already governed; the evidence row is a receipt). Knowledge
and Memory writes are different: they are new facts an Agent chooses to create from its own
reasoning, symmetrically with `project.write_file`, and Yusuf's own audit trail should be able to
answer "which Agent asserted this fact, when, under what intent" with the same evidentiary weight as
any other write. `KnowledgeAdapter`/`MemoryAdapter` therefore both extend `GovernedAdapter` exactly
like `ProjectAdapter`: `preflight()` returns a `resourceVersion` (for Knowledge, `"NEW"` for a create
— there is nothing to collide with yet, matching `project.write_file`'s own precedent of
`fileDigest` returning `"ABSENT"` for a not-yet-existing file; for Memory, the current row's
`canonicalHash` if `(scope, scopeRef, key)` already exists, else `"ABSENT"`, so a concurrent
conflicting write to the same memory key is caught by the framework's live-preflight recheck exactly
like a file write is), `execute()` performs the Prisma write inside the adapter (not in
`AgentRunCoordinator`), `verify()` re-reads the row by uuid and compares a digest, and `reconcile()`
re-reads by the deterministic idempotency key (`(scope, scopeRef, key)` for Memory, uuid for
Knowledge) to resolve any `FAILED_UNKNOWN`. This establishes the precedent Gate E/H/I never needed:
a governed adapter is not defined by touching something outside the database — it is defined by
"does an Agent get to decide this happened," and Knowledge/Memory clearly qualify.

## Risk levels

| Capability | operationClass | risk | outcome | verification |
|---|---|---|---|---|
| `knowledge.read` | READ | L0 | ALLOW | none |
| `knowledge.write` | LOCAL_WRITE | L1 | ALLOW | required |
| `memory.read` | READ | L0 | ALLOW | none |
| `memory.write` | LOCAL_WRITE | L1 | ALLOW | required |

No new `REQUIRE_APPROVAL`/`FORBIDDEN` outcome is introduced. These are all internal, reversible,
no-external-blast-radius writes to Yusuf's own database — the same tier as `project.write_file`,
one step below `git.push_feature_branch`'s L3.

## Agent grants

- **Engineering**: `knowledge.read`, `knowledge.write`, `memory.read`, `memory.write` added to
  `allowedCapabilities` (read is included alongside write — an agent that records a note needs to
  fetch it back). Engineering already does project/git work under a task/project binding, so
  `PROJECT`/`TASK`-scoped Memory and Knowledge fit its existing role directly — recording "this
  repo's test command is X" is exactly the kind of fact that saves a future run from
  re-discovering it.
- **Reviewer**: `knowledge.read` added. A Reviewer benefits from previously curated facts
  (conventions, known gotchas) without gaining any write capability — its zero-mutation identity is
  unchanged, matching the existing invariant test that already pins Reviewer's capability set.
- **Chief of Staff**: unchanged, `[]`. Explicitly not touched — its zero-capability identity is a
  load-bearing invariant from Gate E ("delegator inherits delegatee's authority" avoidance), and
  granting it memory access was considered and rejected: orchestration already reads durable state
  it needs (tasks/runs/handoffs) without a new capability, and a chat-shaped "let me remember
  things" tool on the one Agent with no capabilities at all is exactly the kind of scope creep this
  design note exists to resist.

## Known limitations (accepted this phase, not fixed)

Independent review (per the standing "self-review is materially weaker" lesson) surfaced these.
One was fixed before commit; the rest are accepted as scoped-out rather than silently missed:

- **Fixed**: `tombstoneExpiredEvidence` originally truncated a row and appended its audit event as
  two separate calls — a failure in the second step would have destroyed content with no audit
  record, the exact silent-forgetting failure ADR-008 exists to prevent. Now both happen inside one
  `db.$transaction`, and a failed row is left completely untouched (still visible to the next run)
  rather than half-truncated.
- **Accepted**: Knowledge and Memory have no retention/expiry of their own, unlike Evidence. The
  only protection against sensitive content landing there is the same generic
  `assertReferencesOnly`/`redactForPersistence` pattern-based scan every capability's payload
  already goes through — a real backstop, but a regex secret-scanner has real false negatives
  (unlabeled prose, non-standard token shapes). Giving Knowledge/Memory their own classification and
  retention is future work, not silently missed.
- **Accepted (pre-existing, not introduced here)**: if `preflight()` throws (e.g. a scope-ownership
  rejection) the intent has no transition to a terminal `FAILED` state and no audit event beyond
  `intent.created` — `ExecutionCoordinator` only wraps `prepare()`/`execute()` in its failure-handling
  try/catch, not `preflight()`. This is a framework-level gap that predates Phase J (any capability's
  `preflight()` rejection hits it), but Memory's scope check is the first capability where an
  ordinary, expected Agent mistake (wrong `scopeRef`) reliably exercises it. Fixing it is a
  framework change, out of scope for this phase.
- **Accepted, a judgment call**: `knowledge.write`/`memory.write` cap each write's size but not the
  total number of writes an Agent can make. Given the narrow blast radius (Engineering only,
  internal DB only, no approval bypass), L1/ALLOW without a volume cap is a reasonable tier for now.

## Non-goals (explicitly deferred)

- Semantic/embedding search over Knowledge.
- A scheduled trigger for `tombstoneExpiredEvidence()`.
- Command Center UI surfacing of Knowledge/Memory/Evidence classification (same "backend first"
  pattern as the Organization model and Gate F).
- `knowledge.write`/`memory.write` for any Agent beyond Engineering.
- A `Memory Curator` Agent/Department — Memory as a *table* exists now; Memory as a *role* remains
  deferred exactly as `DEFERRED_WORK.md` already states.
