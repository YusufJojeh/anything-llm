# ADR-008: Knowledge, Memory, Evidence, and Secret Retention

- Status: Accepted for Gate B
- Covers requested ADRs: 019, 024

## Decision

Conversational Memory, sourced Knowledge, and execution Evidence are separate concepts. Evidence is classified as `PUBLIC_METADATA`, `SANITIZED_OUTPUT`, `SENSITIVE_OPERATIONAL`, `SCREENSHOT`, or `SECRET_FORBIDDEN`.

Passwords, cookies, session tokens, authorization headers, private keys, raw credential stores, raw `.env`, and CLI-returned secrets are never persisted. Retention is configurable by evidence class. Expired evidence leaves a digest/classification tombstone and audit event.

## Consequences

- Existing AnythingLLM Memory remains personalization only.
- Security metadata can outlive short-lived screenshots/operational payloads.
- Redaction occurs before logs, model visibility, receipts, API and realtime.
- Forgetting controls cannot erase required security audit history silently.

