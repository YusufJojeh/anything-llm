# Yusuf OS Domain Contracts

These are technology-neutral contracts. TypeScript-like syntax documents shape, not a commitment to TypeScript or generated Prisma types.

## 1. Shared primitives

```ts
type Id = string;                 // server-generated UUID
type Instant = string;            // ISO-8601 UTC
type Version = number;            // monotonically incremented optimistic lock
type JsonObject = Record<string, unknown>;
type PrincipalType = "USER" | "AGENT" | "SCHEDULE" | "SYSTEM";

interface PrincipalRef {
  type: PrincipalType;
  id: Id;
  displayLabel?: string;          // presentation only; never authority
  version?: Version;
}

interface ResourceRef {
  type: string;                   // e.g. git.repository
  id: string;                     // canonical stable identity
  version?: string;               // SHA, ETag, revision, or policy version
}
```

IDs, timestamps, idempotency keys, decision versions, risk, and authority are server-owned. Model-provided values are requests only.

## 2. AgentDefinition

```ts
interface AgentDefinition {
  id: Id;
  key: string;
  version: Version;
  name: string;
  role: string;
  mission: string;
  instructionRef: { id: Id; version: Version; digest: string };
  status: "DRAFT" | "ACTIVE" | "DISABLED" | "ARCHIVED";
  modelPolicyRef?: { routerId: Id; version?: Version };
  memoryPolicyRef?: { id: Id; version: Version };
  budgetPolicyRef?: { id: Id; version: Version };
  approvalPolicyRef: { id: Id; version: Version };
  escalationAgentId?: Id;
  maxConcurrentRuns: number;
  createdAt: Instant;
  updatedAt: Instant;
}
```

An AgentDefinition is not a Workspace. Workspace knowledge/chat may be referenced as runtime context, but cannot grant tools or authority.

## 3. Capability and agent policy

```ts
interface CapabilityDefinition {
  key: string;                    // git.push_feature_branch
  semanticVersion: number;
  description: string;
  resourceTypes: string[];
  requestSchemaRef: string;
  canonicalizerRef: string;
  verifierRef: string;
  adapterKinds: string[];
  defaultEffect: "READ" | "LOCAL_MUTATION" | "EXTERNAL_MUTATION" | "DESTRUCTIVE";
}

interface AgentCapabilityPolicy {
  id: Id;
  version: Version;
  agentId: Id;
  capabilityKey: string;
  enabled: boolean;
  resourceConstraints: JsonObject;
  targetConstraints: JsonObject;
  payloadConstraints: JsonObject;
  projectPolicyCanTighten: true;
  createdAt: Instant;
  updatedAt: Instant;
}
```

Capability membership only permits requesting evaluation. It does not imply `ALLOW`.

## 4. PolicyDecision and risk semantics

```ts
type PolicyOutcome = "ALLOW" | "REQUIRE_APPROVAL" | "DENY" | "FORBIDDEN";
type RiskLevel = "L0" | "L1" | "L2" | "L3" | "L4";

interface PolicyDecision {
  id: Id;
  intentId: Id;
  decisionVersion: Version;
  outcome: PolicyOutcome;
  riskLevel: RiskLevel;
  reasonCode: string;
  explanation: string;
  matchedRules: Array<{ ruleId: Id; ruleVersion: Version; effect: string }>;
  evaluatedAgentPolicy?: { id: Id; version: Version };
  evaluatedProjectPolicy?: { id: Id; version: Version };
  evaluatedResourceVersions: Array<ResourceRef>;
  evaluatedAccountConstraint?: SafeAccountConstraint;
  policyBundleDigest: string;
  decidedBy: PrincipalRef;        // named SYSTEM Policy Engine
  decidedAt: Instant;
}
```

| Outcome | Meaning | Approval created? |
|---|---|---|
| `ALLOW` | Current policy permits execution without human approval | No |
| `REQUIRE_APPROVAL` | Only Yusuf can authorize this immutable intent | Yes |
| `DENY` | Request is not authorized in current context; policy/config may later change | No |
| `FORBIDDEN` | Action category is prohibited and cannot be approved normally | No |

Initial `FORBIDDEN` set includes credential extraction, cookie/session export, private-key reads, policy/approval/audit mutation by agents, bypass attempts, inherited-secret shell, direct or forced push to protected main branches, and unrestricted credential commands.

Default risk meanings:

- L0: observe public/non-sensitive state.
- L1: analyze, plan, or derive without mutation.
- L2: allowlisted local mutation with bounded rollback and no external effect.
- L3: external/account-visible mutation requiring durable Yusuf approval.
- L4: destructive, production, financial, security-boundary, or difficult-to-recover mutation; per-operation confirmation or `FORBIDDEN`.

Risk is Policy output and is never accepted from an Agent request.

## 5. Action request and adapter-neutral ActionIntent

```ts
interface AgentActionRequest {
  requestedByPrincipal: PrincipalRef;
  owningAgentId?: Id;
  taskId: Id;
  runId: Id;
  capabilityKey: string;
  resource: ResourceRef;
  target: JsonObject;
  desiredPayload: JsonObject;
  assertedPreconditions?: JsonObject; // untrusted until resolved
}

interface ActionIntent {
  id: Id;
  version: Version;
  requestedByPrincipal: PrincipalRef;
  owningAgentId?: Id;
  taskId: Id;
  runId: Id;
  capabilityKey: string;
  capabilityVersion: number;
  resource: ResourceRef;
  canonicalTarget: JsonObject;
  canonicalPayload: JsonObject;
  canonicalPreconditions: JsonObject;
  targetIdentityDigest: string;
  payloadHash: string;
  canonicalizationVersion: number;
  status: IntentStatus;
  activePolicyDecisionId?: Id;
  createdAt: Instant;
  updatedAt: Instant;
  expiresAt?: Instant;
}
```

`selectedAdapter`, CLI arguments, selectors, HTTP methods, and transport credentials never appear in the ActionIntent. Canonical JSON uses documented key ordering, Unicode normalization, number handling, omission rules, and domain-specific normalization before SHA-256 hashing.

## 6. ExecutionPlan and adapter selection

```ts
interface SafeAccountIdentity {
  provider: string;
  accountLabel?: string;
  safeAccountIdentifier?: string; // username/email hash/provider id as policy permits
  origin?: string;
}

interface SafeAccountConstraint {
  provider: string;
  expectedIdentifier?: string;
  expectedOrigin?: string;
}

interface AdapterAvailability {
  adapterId: Id;
  adapterKind: string;
  status: "AVAILABLE" | "UNAVAILABLE" | "AUTH_REQUIRED" | "PERMISSION_MISSING" | "DEGRADED";
  account?: SafeAccountIdentity;
  capabilities: string[];
  diagnostics: JsonObject;        // secret-free
  checkedAt: Instant;
}

interface ExecutionPlan {
  id: Id;
  version: Version;
  intentId: Id;
  policyDecisionId: Id;
  adapterCandidates: Id[];
  selectedAdapterId: Id;
  adapterSpecificPreparedInput: JsonObject; // encrypted/redacted where applicable
  accountIdentity?: SafeAccountIdentity;
  preflightResult: PreflightResult;
  semanticEquivalenceDigest: string;
  createdBy: PrincipalRef;        // Broker component
  createdAt: Instant;
  expiresAt: Instant;
}
```

Changing adapters is permitted without a new human decision only after re-policy proves unchanged capability, target, business effect, payload hash, resource preconditions, account constraint, and equal-or-stricter risk. The approval is not normally adapter-bound.

## 7. ApprovalRequest

```ts
interface ApprovalRequest {
  id: Id;
  version: Version;
  intentId: Id;
  policyDecisionId: Id;
  payloadHash: string;
  targetIdentityDigest: string;
  boundResourceVersions: ResourceRef[];
  boundAccountConstraint?: SafeAccountConstraint;
  requiredRiskLevel: "L3" | "L4";
  status: ApprovalStatus;
  requestedAt: Instant;
  expiresAt: Instant;
  decidedAt?: Instant;
  decidedBy?: PrincipalRef;       // must be USER
  decisionNote?: string;
  consumedAt?: Instant;
  revokedAt?: Instant;
}
```

Decision request:

```json
{
  "decision": "APPROVE",
  "expectedPayloadHash": "...",
  "expectedIntentVersion": 3,
  "expectedApprovalVersion": 1,
  "note": "Reviewed target and commit"
}
```

The client never supplies the authoritative idempotency or execution key.

## 8. Adapter, preflight, execution, and verification

```ts
interface GovernedAdapter {
  descriptor(): AdapterDescriptor;
  availability(ctx: AdapterContext): Promise<AdapterAvailability>;
  prepare(intent: ActionIntent, ctx: AdapterContext): Promise<PreparedAction>;
  preflight(prepared: PreparedAction, ctx: AdapterContext): Promise<PreflightResult>;
  execute(prepared: PreparedAction, claim: ExecutionClaim): Promise<AdapterExecutionResult>;
  verify(intent: ActionIntent, result: AdapterExecutionResult, ctx: AdapterContext): Promise<VerificationResult>;
  reconcile(intent: ActionIntent, claim: ExecutionClaim, ctx: AdapterContext): Promise<ReconciliationResult>;
}

interface PreflightResult {
  status: "PASS" | "FAIL" | "CHANGED_CONTEXT";
  resourceVersions: ResourceRef[];
  account?: SafeAccountIdentity;
  semanticEffectDigest: string;
  warnings: string[];
  checkedAt: Instant;
}

interface ExecutionClaim {
  intentId: Id;
  executionKey: string;          // server-generated, unique
  attempt: number;
  claimedByComponent: PrincipalRef;
  leaseExpiresAt: Instant;
}

interface VerificationResult {
  status: "VERIFIED" | "NOT_APPLIED" | "MISMATCH" | "UNKNOWN";
  verifierId: string;
  verifierVersion: number;
  observedResourceVersions: ResourceRef[];
  sanitizedEvidence: EvidenceRef[];
  checkedAt: Instant;
}
```

Adapters receive only prepared, typed input and explicitly scoped credentials/environment. They cannot accept raw model shell text.

## 9. ActionReceipt

```ts
interface ActionReceipt {
  id: Id;
  intentId: Id;
  executionPlanId: Id;
  executionKey: string;
  adapterId: Id;
  safeAccountIdentity?: SafeAccountIdentity;
  outcome: "SUCCEEDED" | "FAILED" | "UNKNOWN";
  externalReference?: string;
  beforeVersions: ResourceRef[];
  afterVersions: ResourceRef[];
  sanitizedOutput?: JsonObject;
  verification: VerificationResult;
  startedAt: Instant;
  completedAt?: Instant;
}
```

A successful adapter exit is not `VERIFIED`. Verification must assert the intended business effect independently when possible.

## 10. Task, dependencies, and AgentRun

```ts
interface Task {
  id: Id;
  version: Version;
  projectId?: Id;
  requestedByPrincipal: PrincipalRef;
  parentTaskId?: Id;
  assignedAgentId?: Id;
  title: string;
  objective: string;
  priority: "P0" | "P1" | "P2" | "P3";
  status: "PLANNED" | "READY" | "RUNNING" | "BLOCKED" | "WAITING_APPROVAL" | "COMPLETED" | "FAILED" | "CANCELLED";
  completionGates: CompletionGate[];
  deadline?: Instant;
  createdAt: Instant;
  updatedAt: Instant;
}

interface TaskDependency {
  taskId: Id;
  dependsOnTaskId: Id;
  relation: "BLOCKS" | "REQUIRES_OUTPUT" | "REVIEW_GATE" | "SECURITY_GATE";
}

interface AgentRun {
  id: Id;
  version: Version;
  taskId: Id;
  agentId: Id;
  requestedByPrincipal: PrincipalRef;
  status: "QUEUED" | "RUNNING" | "WAITING_APPROVAL" | "VERIFYING" | "COMPLETED" | "FAILED" | "FAILED_UNKNOWN" | "CANCELLED";
  modelRef?: JsonObject;
  promptDigest?: string;
  tokenUsage?: JsonObject;
  estimatedCostMicros?: number;
  startedAt?: Instant;
  completedAt?: Instant;
}
```

Cycles are rejected by the Task service. Deletion archives definitions; it does not erase runs, intents, approvals, receipts, or audit history.

## 11. Evidence and secrets

```ts
type EvidenceClass =
  | "PUBLIC_METADATA"
  | "SANITIZED_OUTPUT"
  | "SENSITIVE_OPERATIONAL"
  | "SCREENSHOT"
  | "SECRET_FORBIDDEN";

interface EvidenceRef {
  id: Id;
  classification: EvidenceClass;
  digest: string;
  storageRef?: string;
  redactionProfile: string;
  retentionPolicyId: Id;
  capturedAt: Instant;
  expiresAt?: Instant;
}
```

`SECRET_FORBIDDEN` is never persisted and is removed before LLM visibility, logs, traces, receipts, or UI. Forbidden examples include passwords, cookies, session tokens, authorization headers, private keys, raw `.env`, credential-store material, and secrets returned by CLI.

Retention policies are configuration records, not hard-coded durations. Audit metadata may be retained long term; screenshots and sensitive operational evidence use shorter explicit policies. Expiry deletes evidence payloads while retaining a tombstone containing classification, digest, deletion reason, and timestamps.

## 12. AuditEvent

```ts
interface AuditEvent {
  id: Id;
  sequence: number;
  occurredAt: Instant;
  eventType: string;
  principal: PrincipalRef;
  taskId?: Id;
  runId?: Id;
  intentId?: Id;
  approvalId?: Id;
  resource?: ResourceRef;
  outcome?: string;
  metadata: JsonObject;           // canonical, redacted
  canonicalizationVersion: number;
  previousHash: string;
  eventHash: string;
}
```

Hash input is the canonical serialization of all fields except `eventHash`, including `previousHash`. Hash chains provide tamper evidence, not immutability against an attacker who can rewrite the entire database and checkpoints. Periodic signed or externally anchored checkpoints are a future hardening option.

