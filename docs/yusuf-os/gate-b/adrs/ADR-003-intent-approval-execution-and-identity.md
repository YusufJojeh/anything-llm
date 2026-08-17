# ADR-003: Intent, Approval, Execution, and Identity

- Status: Accepted for Gate B
- Covers requested ADRs: 006, 007, 009, 010

## Decision

`ActionIntent` contains adapter-neutral semantic capability, resource, target, canonical payload and preconditions. Broker-owned `ExecutionPlan` contains adapter candidates, selected adapter, prepared input and safe account identity.

Approvals bind immutable intent/payload/target/resource/account/policy context, not normally a selected adapter. Adapter fallback re-runs Policy and preserves approval only when semantics and authority remain equivalent.

Structured Principals distinguish `USER`, `AGENT`, `SCHEDULE`, and named `SYSTEM` components. Human approval must be a `USER` decision.

## Consequences

- CLI/browser/API fallback is possible without transport-specific approvals.
- Account or semantic changes invalidate authorization.
- Approval and execution are separate transitions and records.
- Models/clients cannot manufacture execution identity or keys.

