# ADR-002: Central Action and Policy Boundary

- Status: Accepted for Gate B
- Covers requested ADRs: 003, 004, 005

## Decision

Every governed side effect crosses one logical Action Boundary. Agents request versioned semantic capabilities; they do not provide risk, approval requirement, or authority. Policy returns `ALLOW`, `REQUIRE_APPROVAL`, `DENY`, or `FORBIDDEN` and assigns L0-L4 with matched rule/version evidence.

`FORBIDDEN` actions never create normal approvals. L4 has no wildcard or always-allow mechanism.

## Consequences

- AIbitat, scheduler, MCP, flows and future adapters use the same boundary.
- Capability possession permits requesting evaluation only.
- Legacy tools must be classified/wrapped or excluded.
- Policy changes are authenticated Yusuf administrative actions, never agent actions.

