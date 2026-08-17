# ADR-007: Scheduling, Realtime, and Command Center Projections

- Status: Accepted for Gate B
- Covers requested ADRs: 017, 018, 021

## Decision

Scheduled L3/L4 work persists Task/Run/Intent/Approval, enters `WAITING_APPROVAL`, and exits without WebSocket dependency. Approval later wakes an idempotent coordinator that revalidates and resumes.

HTTP snapshots are source of truth. Versioned SSE provides at-least-once hints with cursor, gap detection, deduplication and snapshot reconciliation. Command Center consumes normalized projections, never agent prose.

## Consequences

- Existing scheduled auto-approval is removed in Gate C.
- Existing chat WebSocket can remain for chat presentation.
- Dashboard state has explicit versions and timestamps.
- Control commands remain authenticated HTTP mutations.

