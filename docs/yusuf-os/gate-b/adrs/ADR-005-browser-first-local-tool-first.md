# ADR-005: Browser-First and Local-Tool-First

- Status: Accepted for Gate B
- Covers requested ADR: 008

## Decision

Prefer Yusuf's existing user-controlled authenticated Chrome session and locally authenticated typed CLI tools. Never copy browser credentials or expose raw shell/CDP. Authentication availability does not grant agent authority; Policy and durable approval still govern every action.

The initial trusted families are Git, available/authenticated `gh`, scoped filesystem operations, and project-registered checks. Other binaries require typed capability registration.

## Consequences

- Browser bridge is contract-only until a safe attachment mechanism is selected.
- Open Computer is deferred.
- Adapter availability returns safe identity metadata only.
- External mutation blocks on unknown/mismatched account identity when policy requires it.

