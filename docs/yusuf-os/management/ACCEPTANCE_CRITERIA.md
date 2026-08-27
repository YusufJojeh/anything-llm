# Yusuf OS Acceptance Criteria

## Evidence vocabulary

- **IMPLEMENTED:** production code and persistence/migration shape exist.
- **VERIFIED_BY_TEST:** focused and appropriate full regressions pass.
- **LIVE_VALIDATED:** the real provider/device/browser/account path completed with bounded evidence.
- **HUMAN_ACTION_REQUIRED:** only Yusuf can safely supply the permission, secret, device judgment, or consequential approval.
- **DEFERRED:** deliberately outside the current value slice.

No item may inherit a stronger label from a fixture or mocked provider.

## Every major slice

1. States the Yusuf problem, improved workflow, owning Agent/Department, reused capabilities, security boundary, maintenance cost, and measurable success condition.
2. Documents semantic capability and trust boundaries before implementation.
3. Has deterministic focused tests and the appropriate full backend/frontend regression.
4. Preserves approval binding, single use, risk monotonicity, verification, receipt, audit, and `FAILED_UNKNOWN` rules.
5. Receives a fresh independent review reporting P0/P1/P2, evidence, files, and regression requirements; P0/P1 are fixed.
6. Documents the result and exact evidence, then uses an exact-file local commit. No push/deploy follows implicitly.
7. Meets EN/AR/RTL, keyboard, screen-reader, reduced-motion, responsive, and real-state requirements when UI is affected.

## Live Command Center and voice commissioning

- Real local session unlocks without persisting or logging token values.
- Live SSE visibly updates at least one genuine task/run/approval state.
- Task, run, approval, runtime, and evidence views agree.
- Manual microphone permission, record, cancel, send, and playback paths are accepted on the target device/browser.
- Denied permission and unavailable provider states remain honest and recoverable.

## Browser read-only commissioning

- Chrome is manually launched and attached through the documented opt-in boundary.
- Only an exact allowlisted origin is reachable.
- Page content is untrusted data, never policy or instruction authority.
- One semantic read produces bounded verified output, receipt, and audit evidence.
- No click, submit, upload, download, credential access, or navigation outside policy occurs.

## First governed mutation

- Exact account, origin, action schema, capability, risk, and approval subject are bound.
- Preview/dry-run evidence is understandable to Yusuf.
- Required human approval is explicit and single use; scheduled execution cannot approve L3/L4.
- Postcondition verification proves success; ambiguous effects enter `FAILED_UNKNOWN` and are reconciled without blind retry.
- Revocation/disable and incident evidence paths are tested.

## External integration slice

- Starts with least-privilege read scope and explicit account binding.
- Treats all external content as prompt-injection capable.
- Keeps secrets and raw credentials out of Agent/model context and audit payloads.
- Has provider-specific timeout, rate-limit, token-revocation, duplicate-effect, and reconciliation tests.
- Adds mutation only as a separately accepted capability.

## Agent Workspace

- Remains distinct from generic chat and from the global Command Center.
- Uses real Agent, task, capability, approval, evidence, memory-label, and runtime state.
- Supports desktop, tablet, mobile, EN, AR, RTL, keyboard, screen reader, and reduced motion.
- The command bar supports text, voice, attachments, stop, and send without obscuring governed-action status.
- A measured performance budget prevents the operating console from becoming slower than the workflows it improves.

