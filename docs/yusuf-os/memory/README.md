# Yusuf OS Project Memory

This directory is durable, cross-session engineering memory for Claude Code (and any other agent)
working on Yusuf OS. It complements, but does not replace, `docs/yusuf-os/gate-b/` (the detailed
architecture/design record) and `.engineering-intelligence/` (gate evidence records). Prefer
linking to those over duplicating their content here.

## Read order for a new session

1. `CURRENT_STATE.md` — two-minute orientation.
2. `CURRENT_GATE.md` — what's in scope right now.
3. `ARCHITECTURE_INVARIANTS.md` — what must never be weakened.
4. `KNOWN_RISKS.md` and `DEFERRED_WORK.md` — what not to try to fix/build unprompted.
5. `SESSION_HANDOFF.md` — what the last session actually did.

## Files in this directory

| File | Purpose |
|---|---|
| `PRODUCT_CHARTER.md` | What Yusuf OS is and isn't, for product/scope judgment calls |
| `ARCHITECTURE_INVARIANTS.md` | Non-negotiable security invariants |
| `CURRENT_STATE.md` | Fast orientation: branch, what's built, what's next |
| `DECISIONS.md` | High-value decisions not fully captured by an ADR |
| `SECURITY_MODEL.md` | Operational map of the security model (links to full threat model) |
| `GATE_HISTORY.md` | Gate A/B/C status with evidence; Gate D not started |
| `CURRENT_GATE.md` | Objective/scope/acceptance criteria for the active gate |
| `ROADMAP.md` | Gate D onward, and the deferred agent/frontend roadmap |
| `SKILLS_INVENTORY.md` | Which installed skills matter to this project and why |
| `REPOSITORY_MAP.md` | Ownership map: upstream vs. Yusuf OS vs. deferred areas |
| `TEST_BASELINE.md` | Last verified test/lint counts, with re-run instructions |
| `KNOWN_RISKS.md` | Unresolved residual risks, carried from Gate C |
| `DEFERRED_WORK.md` | What belongs to later gates — don't build it early |
| `SESSION_HANDOFF.md` | Rolling log of what the most recent sessions did |

## Memory trust levels

Claims in these files are tagged so a future session knows how much to trust them:

- `VERIFIED_FROM_REPOSITORY` — confirmed by reading the actual file/code.
- `VERIFIED_BY_TEST` — confirmed by actually running the test/lint command.
- `DOCUMENTED_DECISION` — stated in a Gate B ADR or verdict doc, not independently re-derived.
- `REPORTED_NOT_REVERIFIED` — taken from a prior engineering-intelligence record or handoff prompt, not re-checked this session.
- `INFERENCE` — a reasonable conclusion, not a direct observation.
- `PLANNED` — future work, not yet true of the repository.

## Memory update protocol

At the end of any substantial session that touches Yusuf OS:

1. Update `CURRENT_STATE.md` and `CURRENT_GATE.md` if gate status changed.
2. Append to `SESSION_HANDOFF.md` (keep it a rolling log, not an unbounded transcript — trim old entries once superseded).
3. Add to `DECISIONS.md` only if something genuinely new and non-obvious was decided.
4. Update `KNOWN_RISKS.md` / `TEST_BASELINE.md` if risk posture or test counts changed.
5. Never silently rewrite historical gate evidence in `GATE_HISTORY.md` — append, don't erase.
6. Never write secrets (keys, tokens, HMAC values) into any file here — env var *names* only.
