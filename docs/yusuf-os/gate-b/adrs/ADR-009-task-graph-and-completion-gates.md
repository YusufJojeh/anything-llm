# ADR-009: Agent Task Graph and Completion Gates

- Status: Accepted for Gate B
- Covers requested ADR: 020

## Decision

Tasks form an acyclic dependency graph with explicit handoff, review and security gates. Agent text does not complete a task. Completion requires terminal intents, required verified receipts, satisfied dependencies/gates, and no pending approval or unresolved unknown outcome.

## Consequences

- Builder and Reviewer remain separate accountable agents.
- Chief of Staff coordinates but cannot override blocked policy/security gates.
- Task service rejects dependency cycles.
- UI projections expose real blockers and handoffs.

