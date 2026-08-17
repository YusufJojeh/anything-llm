# ADR-006: MCP, Imported Skills, Flows, and SQL Governance

- Status: Accepted for Gate B
- Covers requested ADRs: 014, 015, 016

## Decision

MCP discovery is distinct from per-tool capability authorization and uses minimal child environments. Arbitrary imported in-process Node skills are not governed Yusuf extensions; they are explicitly trusted local code outside the policy claim or deferred pending isolation.

Every Agent Flow step is intercepted. Network calls use a governed adapter with SSRF, redirect, origin, header, timeout and size policies. SQL uses deterministic parsing/classification plus read-only credentials; prompt claims are insufficient.

## Consequences

- Enabled MCP server does not authorize its tools.
- Unknown/unmapped MCP and flow mutations fail closed.
- Broker wrapping does not falsely claim containment of module-load side effects.
- Existing raw SQL tool is excluded from Yusuf Agents.

