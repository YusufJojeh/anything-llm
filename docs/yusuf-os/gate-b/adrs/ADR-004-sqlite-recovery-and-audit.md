# ADR-004: SQLite, Recovery, and Tamper-Evident Audit

- Status: Accepted for Gate B
- Covers requested ADRs: 011, 012, 013

## Decision

SQLite remains the v1 personal-production database. Security transitions use short transactions, conditional updates, versions and unique indexes. Server-owned execution keys prevent duplicates. Unknown external outcomes enter `FAILED_UNKNOWN` and reconcile before retry.

Yusuf audit is a dedicated append-only application service with canonical chained hashes. Parent archival never cascades to audit. Hashing provides tamper evidence, not immutable storage.

## Consequences

- External effects never occur inside DB transactions.
- `SQLITE_BUSY` handling is bounded around short transactions.
- Verified execution returns an existing receipt on duplicate invocation.
- Future signed/external audit checkpoints remain optional hardening.

