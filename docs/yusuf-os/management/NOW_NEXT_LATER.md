# Yusuf OS Now / Next / Later

_Established: 2026-08-27. NOW is intentionally limited to two items because the second depends on safe human commissioning and the first real mutation belongs after both proofs._

## NOW

### YOS-001 — Commission the real Command Center and voice path

- **Objective:** Validate the existing `/os` experience against the real local control plane, live SSE, and a manual microphone flow.
- **User outcome:** Yusuf can trust that the Command Center reflects his real system and can speak to it on his actual browser/device.
- **Technical scope:** Startup validation; manual token entry; `/os` projections; SSE updates; task/run/approval drilldowns; microphone permission, record, cancel, playback, and governed voice command flow. No new feature work unless commissioning exposes a defect.
- **Dependencies:** Yusuf supplies the session/control token manually and performs browser microphone permission and listening judgments.
- **Risk:** Medium—local secrets must not be logged or persisted, and a fixture must not be mistaken for live state.
- **Acceptance criteria:** Real unlocked session; confirmed live state transition over SSE; working drilldowns; manual mic acceptance on the target browser/device; evidence notes contain no secret values.
- **Status:** READY — HUMAN-ASSISTED; not started by this audit.
- **Evidence:** Phases S, U, Z, AD, and AE; fresh backend/frontend test and build evidence dated 2026-08-27.
- **Owner/Agent:** Yusuf + Chief of Staff; Engineering handles defects only.
- **Deferred reason:** Not deferred.

### YOS-002 — Prove a real read-only Browser Broker observation

- **Objective:** Attach to a manually launched real Chrome instance and observe one explicitly allowlisted origin without mutation.
- **User outcome:** Yusuf knows the governed browser boundary works in reality before entrusting it with an external action.
- **Technical scope:** Optional browser dependency, manual CDP launch, feature flag, exact origin allowlist, attach/discovery, read-only semantic capability, verification, receipt, and audit review.
- **Dependencies:** YOS-001; Yusuf chooses the safe origin and manually launches Chrome with the approved debugging configuration.
- **Risk:** High—browser content is untrusted and may attempt prompt injection; the attached profile/session has ambient authority.
- **Acceptance criteria:** Exact-origin attachment; no unrestricted browsing tool reaches an Agent; one read-only observation is verified; receipt/audit are inspectable; no click, form submission, or mutation occurs.
- **Status:** READY — HUMAN-ASSISTED; not started by this audit.
- **Evidence:** Phase X readiness tests and Browser Broker runbook; no prior live Chrome attachment is claimed.
- **Owner/Agent:** Engineering + Reviewer, approved and operated by Yusuf.
- **Deferred reason:** Not deferred.

## NEXT

### YOS-003 — First governed real external action

- **Objective:** Register and execute one controlled external action end to end.
- **User outcome:** Yusuf gets one useful real-world task completed with approval and verification he can trust.
- **Technical scope:** Select one form/action; semantic capability; exact origin/schema; account binding; L3/L4 approval behavior as policy requires; verification; `FAILED_UNKNOWN` reconciliation; receipt and audit.
- **Dependencies:** YOS-002 and Yusuf's explicit choice of action/account.
- **Risk:** High—first real mutation and new external trust boundary.
- **Acceptance criteria:** Threat model and acceptance test exist; dry run passes; live execution is explicitly approved; outcome is verified or safely reconciled; no blind retry.
- **Status:** DISCOVERY.
- **Evidence:** Existing action, policy, approval, broker, verification, reconciliation, and audit primitives.
- **Owner/Agent:** Existing domain Agent selected by the workflow + Engineering + Reviewer.
- **Deferred reason:** Must earn mutation scope through read-only commissioning first.

### YOS-004 — Gmail controlled vertical slice

- **Objective:** Make inbox triage the first durable external integration.
- **User outcome:** Yusuf can review real mail-derived work and approve bounded follow-up without exposing unrestricted mailbox access to Agents.
- **Technical scope:** Begin with read-only messages/threads; semantic capabilities; account binding; scoped OAuth/secrets; prompt-injection defense; approvals for mutation; verification, reconciliation, and audit.
- **Dependencies:** YOS-003 pattern and explicit Google account authorization.
- **Risk:** High—sensitive content, untrusted message bodies, OAuth lifecycle, and outbound-message consequences.
- **Acceptance criteria:** Least-privilege read slice first; hostile-content tests; no raw credentials in Agent context; a verified inbox-triage outcome; mutation remains disabled until separately accepted.
- **Status:** PROPOSED.
- **Evidence:** Inbox Agent and governed capability architecture already exist; no live Gmail binding is claimed.
- **Owner/Agent:** Inbox + Chief of Staff; Engineering integration owner; Reviewer assurance.
- **Deferred reason:** First external-action pattern must be commissioned before a durable provider integration.

### YOS-005 — Dedicated Agent Workspace

- **Objective:** Create the focused technical operating console distinct from the global `/os` Command Center.
- **User outcome:** Yusuf can converse and work with one Agent while seeing its context, capabilities, approvals, evidence, tasks, and runtime in one responsive workspace.
- **Technical scope:** Left staff rail; central command/conversation and operational timeline; right tabs for Agent, Context, Skills, Memory, Evidence, Tasks, Runtime; bottom text/voice/attachment/stop/send bar; EN/AR/RTL/accessibility/reduced motion; real state only.
- **Dependencies:** Commissioning feedback from YOS-001 and reuse of existing state/API components.
- **Risk:** Medium—large UI surface may duplicate routes or imply capabilities the backend does not expose.
- **Acceptance criteria:** Clearly distinct from generic chat; no fake activity; desktop/tablet/mobile and EN/AR/RTL acceptance; keyboard/screen-reader paths; governed actions remain visible; performance budget defined.
- **Status:** PROPOSED.
- **Evidence:** Current implementation has global `/os`, Agent detail drawers, route-specific evidence, and a voice dock, but not the complete workspace composition.
- **Owner/Agent:** Chief of Staff product owner + Engineering; Reviewer/accessibility review.
- **Deferred reason:** Real Command Center usage should shape the workspace before implementation.

### YOS-006 — Daily operations loop

- **Objective:** Compose morning briefing, Needs Yusuf, monitoring, inbox triage, delegation, and voice into a repeatable daily workflow.
- **User outcome:** Yusuf starts and ends the day from one reliable operational loop.
- **Technical scope:** Existing scheduler, notifications, monitoring, tasks, handoffs, and voice; add only missing semantic workflow glue and measurable event timestamps.
- **Dependencies:** YOS-001 and at least one useful live external read integration.
- **Risk:** Medium—notification noise and automation without adequate real input.
- **Acceptance criteria:** Five consecutive operating days; scheduled briefs arrive reliably; every item links to source evidence; intervention points and verified completions are measurable.
- **Status:** PROPOSED.
- **Evidence:** Scheduler, notifications, monitoring, Needs Yusuf, tasks, handoffs, and voice are implemented and tested.
- **Owner/Agent:** Chief of Staff with Monitoring and Inbox.
- **Deferred reason:** Daily value requires commissioned live inputs.

## LATER

### YOS-007/008/009/010 — Calendar, LinkedIn, WhatsApp, and career portals

- **Objective:** Add integrations in the stated order as controlled vertical slices.
- **User outcome:** Yusuf expands real workflows without giving Agents ambient account authority.
- **Technical scope:** Per-provider semantic capabilities, account/approval binding, least privilege, verification, reconciliation, audit, and prompt-injection defense.
- **Dependencies:** YOS-004 operating pattern and demonstrated workflow demand for each provider.
- **Risk:** High—provider terms, API volatility, private data, messaging consequences, and recurring token/adapter maintenance.
- **Acceptance criteria:** One independently accepted read slice before mutation; provider-specific threat model; verified live outcome; maintenance owner and disable/revoke path.
- **Status:** DEFERRED.
- **Evidence:** Product priority only; no implementation claim.
- **Owner/Agent:** Calendar → Chief of Staff; LinkedIn/career portals → Career/Marketing; WhatsApp → Inbox; Engineering/Reviewer for all boundaries.
- **Deferred reason:** Gmail and the first governed mutation must establish the reusable integration pattern.

### YOS-011 — Agency operating-system workflow

- **Objective:** Validate the smallest lead-to-delivery workflow using existing Yusuf OS objects.
- **User outcome:** Yusuf can operate one real agency engagement without maintaining a parallel CRM/ERP.
- **Technical scope:** Research, qualification, outreach, reply, meeting, proposal, project, engineering, review, delivery, case study, and marketing—only the steps evidenced by real usage.
- **Dependencies:** Stable personal daily operations and real business demand.
- **Risk:** High—premature domain expansion and process bureaucracy.
- **Acceptance criteria:** One real engagement completes; object gaps are evidenced; no new Agent is added unless existing ownership demonstrably fails; recurring operating cost is measured.
- **Status:** CONDITIONAL / DEFERRED.
- **Evidence:** Product hypothesis only.
- **Owner/Agent:** Founder + Chief of Staff using existing departments.
- **Deferred reason:** Personal operating use must prove the core first.

