# ADR-001: Yusuf Control Plane and Agent Boundary

- Status: Accepted for Gate B
- Covers requested ADRs: 001, 002, 023

## Decision

Yusuf OS is an isolated control-plane bounded context inside the AnythingLLM fork. AnythingLLM remains the runtime foundation. `AgentDefinition` is a first-class Yusuf entity; a Workspace is context, not identity or authorization.

Mutation routes are localhost-only by default and require Yusuf-specific fail-closed authentication. Single-user mode does not bypass authentication. The server refuses to enable mutations when the control-plane auth invariant is incomplete.

## Consequences

- New `/api/yusuf-os/*` boundary and isolated persistence.
- Existing workspace/chat/RAG behavior remains compatible.
- UI route guards are UX only; backend enforcement is authoritative.
- Future non-local or multi-user deployment requires a new security review/ADR.

