# ADR-010: Upstream Fork Compatibility

- Status: Accepted for Gate B
- Covers requested ADR: 022

## Decision

Yusuf OS uses isolated namespaces, routes, tables and feature boundaries. Core modifications are restricted to narrow interception hooks. Existing Workspace/RAG/provider/developer API behavior is not repurposed as Yusuf authorization.

Before Gate C, Git topology must become `origin = Yusuf-owned fork`, `upstream = Mintplex-Labs/anything-llm`, with `feature/yusuf-os-*` development branches. Gate B does not modify remotes or push.

## Consequences

- Upstream merges remain tractable.
- Existing migration history is immutable; Yusuf tables arrive through additive migrations.
- Gate C starts only after remote safety is explicitly corrected.
- Feature rollback can disable Yusuf OS without rewriting upstream domains.

