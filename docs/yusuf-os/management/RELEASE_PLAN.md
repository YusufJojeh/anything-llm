# Yusuf OS Release Plan

_Updated: 2026-08-27_

## Baseline: V1 complete by test

Local commits and persistent memory consistently record phases S through AE as implemented and verified by test. Phase AC also records a successful bounded Ollama/Gemma live completion on 2026-08-24. This baseline must not be reopened as a new implementation program.

## Release 1 — Live commissioning

Goal: prove the existing system in Yusuf's real daily environment without an external mutation.

Exit evidence:

- Unlocked `/os` uses the real control plane and live SSE state.
- Manual microphone flow is accepted on Yusuf's target browser/device.
- Browser Broker attaches to an explicitly launched real Chrome instance.
- One allowlisted, read-only browser observation is verified and audited.
- Any failure is represented honestly; no fixture evidence is labeled live.

## Release 2 — First governed external action

Goal: prove one deliberately selected real action end to end.

Exit evidence:

- One exact origin and form/action are registered.
- The semantic capability, account binding, policy/risk, approval, verification, reconciliation, and audit behavior are documented and tested.
- A human-approved live execution produces a verified receipt or an honestly reconciled failure.

## Release 3 — External integration slices

Order: Gmail, Calendar, LinkedIn, WhatsApp, then career portals. Each integration begins read-only and earns mutation scope through evidence. See `INTEGRATION_ROADMAP.md`.

## Release 4 — Daily operations

Goal: make the commissioned system useful every day through morning briefing, Needs Yusuf, scheduled monitoring, inbox triage, task delegation, and voice.

## Release 5 — Agency operating system

This release is conditional on demonstrated personal usage and workflow demand. It will model the smallest lead-to-delivery flow using existing Yusuf OS objects before considering new CRM/ERP concepts.

## Release policy

No push, PR, deployment, cloud migration, or history rewrite is part of this plan without Yusuf's explicit request. Each engineering slice requires focused and full tests, security review, fresh independent review, documentation, and an exact-file local commit.

