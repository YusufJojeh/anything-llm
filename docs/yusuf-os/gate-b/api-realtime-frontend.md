# API, Realtime, Projections, and Frontend Contract

## 1. Control-plane security contract

Yusuf OS mutation routes are enabled only when all conditions hold:

- server binding/control-plane listener is localhost by default;
- a Yusuf-specific fail-closed authentication configuration is valid;
- an authenticated `USER` principal is resolved;
- CSRF/origin protection is applied according to the final session transport;
- request body and response limits are small and route-specific;
- object-level authorization and optimistic versions are enforced;
- critical mutation and audit append commit together.

AnythingLLM single-user auth bypass and unscoped developer API keys are not valid authority for Yusuf mutation routes. Read-only exposure may be decided later and does not weaken this invariant.

## 2. HTTP conventions

- Base path: `/api/yusuf-os`.
- JSON only unless a specific evidence download route is introduced later.
- Cursor pagination for unbounded collections.
- Server timestamps are UTC ISO-8601.
- Mutations require expected resource versions where stale state is security-relevant.
- Server generates request, intent, approval, and execution identifiers.
- API never accepts raw shell, browser script, cookies, authorization headers, or private key material.

Errors follow an RFC 9457-compatible shape while preserving stable Yusuf codes:

```json
{
  "type": "https://yusuf-os.local/problems/approval-invalidated",
  "title": "Approval invalidated",
  "status": 409,
  "detail": "The repository commit changed after approval.",
  "instance": "/api/yusuf-os/approvals/apr_123",
  "code": "APPROVAL_INVALIDATED",
  "requestId": "req_123",
  "details": {
    "currentIntentVersion": 4
  }
}
```

Core codes include `AUTH_REQUIRED`, `LOCAL_ONLY`, `VALIDATION_FAILED`, `CAPABILITY_DENIED`, `POLICY_DENIED`, `ACTION_FORBIDDEN`, `APPROVAL_REQUIRED`, `APPROVAL_EXPIRED`, `APPROVAL_INVALIDATED`, `STATE_CONFLICT`, `RESOURCE_VERSION_CHANGED`, `ACCOUNT_MISMATCH`, `ADAPTER_UNAVAILABLE`, `EXECUTION_UNKNOWN`, and `VERIFICATION_FAILED`.

## 3. `/api/yusuf-os/*` surface

### Bootstrap and projections

```text
GET /bootstrap
GET /dashboard
GET /events?after=<cursor>
```

### Agents and capabilities

```text
GET   /agents
POST  /agents
GET   /agents/:agentKey
PATCH /agents/:agentKey
GET   /agents/:agentKey/capabilities
PUT   /agents/:agentKey/capabilities
```

Agent mutations are Yusuf user actions, never callable by an Agent principal. Policy records use dedicated administrative services and are not generic JSON blobs writable through agent routes.

### Projects, tasks, and runs

```text
GET  /projects
POST /projects
GET  /projects/:id

GET  /tasks?status=&agentId=&projectId=&cursor=&limit=
POST /tasks
GET  /tasks/:id
POST /tasks/:id/cancel
GET  /tasks/:id/graph

GET  /runs?taskId=&agentId=&status=&cursor=&limit=
GET  /runs/:id
POST /runs/:id/reconcile
```

There is no generic `PATCH status`. Commands express intent and enforce legal transitions.

### Intents, approvals, receipts, and audit

```text
GET  /intents/:id
GET  /intents/:id/policy-decisions
GET  /intents/:id/receipt

GET  /approvals?status=PENDING&cursor=&limit=
GET  /approvals/:id
POST /approvals/:id/decisions
POST /approvals/:id/revoke

GET  /audit-events?taskId=&runId=&intentId=&cursor=&limit=
GET  /audit-integrity
POST /audit-integrity/check
```

Decision body contains `decision`, expected hashes/versions, and optional note. It never contains idempotency or adapter instructions.

### Adapters and schedules

```text
GET  /adapters
GET  /adapters/:id/availability
POST /adapters/:id/preflight

GET  /schedules
POST /schedules
GET  /schedules/:id
POST /schedules/:id/enable
POST /schedules/:id/disable
POST /schedules/:id/trigger
```

Schedules reference an agent/task template and policy scope, not a flat list of tools.

## 4. Command Center backend projections

`GET /dashboard` returns normalized, prose-independent data:

```ts
interface DashboardProjection {
  asOf: Instant;
  projectionVersion: number;
  eventCursor: string;
  systemStatus: {
    controlPlane: "HEALTHY" | "DEGRADED" | "STOPPED";
    emergencyStop: boolean;
    pendingReconciliation: number;
  };
  agentStatuses: Array<{
    agentId: Id;
    status: "IDLE" | "RUNNING" | "WAITING" | "BLOCKED" | "DISABLED";
    activeTaskId?: Id;
    currentRunId?: Id;
  }>;
  taskStatuses: Array<{
    taskId: Id;
    status: string;
    priority: string;
    blockingReason?: string;
    updatedAt: Instant;
  }>;
  approvalAttentionQueue: Array<{
    approvalId: Id;
    intentId: Id;
    capabilityKey: string;
    riskLevel: "L3" | "L4";
    targetSummary: string;
    expiresAt: Instant;
  }>;
  activeHandoffs: Array<{
    fromAgentId: Id;
    toAgentId: Id;
    taskId: Id;
    gate: string;
  }>;
  runProgress: Array<{
    runId: Id;
    taskId: Id;
    state: string;
    completedGates: number;
    totalGates: number;
  }>;
  adapterHealth: AdapterAvailability[];
  auditSummary: {
    chainStatus: "VALID" | "BROKEN" | "UNCHECKED";
    lastSequence: number;
    lastCheckedAt?: Instant;
  };
  costSummary: {
    todayMicros: number;
    monthMicros: number;
    currency: string;
  };
}
```

The UI never derives status or approvals from model prose, raw logs, color, or animation.

## 5. Realtime contract

HTTP snapshot is the source of truth. SSE is the initial delivery optimization because updates are server-to-browser and existing infrastructure already uses SSE patterns.

```ts
interface YusufEventEnvelope {
  id: string;
  sequence: number;
  schemaVersion: 1;
  type: string;
  occurredAt: Instant;
  aggregateType: "system" | "agent" | "task" | "run" | "intent" | "approval" | "adapter" | "audit";
  aggregateId: string;
  resourceVersion?: number;
  data: JsonObject;
}
```

Semantics:

- monotonically increasing global sequence for the single-user control plane;
- at-least-once delivery;
- client deduplicates by event ID and ignores already-applied sequence/version;
- `Last-Event-ID` or `after` cursor resumes from retained history;
- out-of-order events are buffered only within a small bound; otherwise snapshot refresh;
- a sequence gap, unknown schema version, server retention gap, reconnect, visibility restore, or reducer error triggers reconciliation;
- events contain redacted projection data, not arbitrary traces or secrets;
- control mutations always use authenticated HTTP, never SSE/WebSocket messages.

If a cursor is too old, server returns a reset event/status and the client reloads `/dashboard` plus affected aggregates.

## 6. Frontend route architecture

Keep `/os` independent:

```text
/os                     Command Center
/os/agents
/os/agents/:agentKey
/os/tasks
/os/tasks/:taskId
/os/approvals
/os/approvals/:approvalId
/os/projects
/os/projects/:projectId
/os/runs/:runId
/os/schedules
/os/integrations
/os/models-cost
/os/audit
```

Existing `/` chat remains unchanged through Gate G.

## 7. Frontend component and state ownership

```text
features/yusufOS/
├── api/                 HTTP client and runtime validators
├── realtime/            SSE client, cursor, reducer, reconciliation
├── state/               normalized durable projections and selectors
└── components/
    ├── AppShell/
    ├── AgentConstellation/
    ├── AgentList/
    ├── AttentionQueue/
    ├── TaskTimeline/
    ├── ApprovalReview/
    ├── RunTrace/
    ├── AdapterHealth/
    └── AuditHealth/
```

State rules:

- backend is durable source of truth;
- URL owns filters, selected aggregate, and shareable view state;
- feature store owns normalized server projections, cursor, connection state, and invalidation markers;
- modal tabs, disclosure state, and form drafts stay local;
- no optimistic approval success—decision is pending until server confirms transition;
- every reconnect/gap reconciles with HTTP.

## 8. Approval interaction contract

Approval Review must display:

- requesting principal and owning agent;
- task/project context;
- canonical capability and human-readable business effect;
- exact resource and target identity;
- payload preview/diff with redaction;
- bound commit/resource versions;
- safe expected and detected account identity;
- L3/L4 level and policy explanation;
- expiration and one-use behavior;
- verification plan;
- explicit distinction between approval and execution.

It uses an accessible modal or full route with focus trap, labelled title/description, Escape behavior where safe, deterministic focus return, and no nested interactive controls. L4 requires explicit per-operation confirmation; no wildcard/always-allow control is shown.

## 9. Relationship-centered behavior

Trust is earned through transparency rather than inferred from frequency:

- show why Policy classified an action;
- show past verified outcomes and corrections;
- allow Yusuf to inspect/forget non-security memory while security audit remains governed by retention;
- expose escalation and recovery paths;
- never silently upgrade autonomy from observed behavior;
- policy changes remain explicit Yusuf actions.

## 10. Accessibility, RTL, responsive, and motion constraints

- WCAG 2.2 AA target.
- Native semantics before ARIA.
- Graph always has an equivalent synchronized list/table and complete keyboard operation.
- Async status and attention changes use deliberate `aria-live` regions without flooding announcements.
- Focus does not jump on realtime updates.
- Arabic, Farsi, and Hebrew set document `lang` and `dir=rtl`.
- Use logical layout properties and direction-aware icons; mixed-direction identifiers use safe bidi isolation.
- Dates, numbers, currency, and cost use locale-aware formatters.
- Layout survives text expansion, 200% zoom, narrow widths, and orientation changes without horizontal page scrolling.
- Touch targets are at least 44 by 44 CSS pixels where applicable.
- `prefers-reduced-motion` removes constellation motion; status remains understandable without motion/color.
- forced-colors mode preserves focus, borders, status text, and actionable controls where practical.
- mobile fallback prioritizes Attention Queue, active tasks, and agent list; constellation becomes optional summary.

Future validation includes AccessLint scan/diff/audit, automated accessibility checks, keyboard/focus walkthrough, screen reader semantics, RTL, reduced motion, zoom/reflow, and forced-colors checks.

