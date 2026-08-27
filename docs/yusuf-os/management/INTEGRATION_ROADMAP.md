# Yusuf OS Integration Roadmap

_Updated: 2026-08-27_

## Reusable vertical-slice contract

Every provider must pass through:

Account binding → semantic capability → ActionIntent → policy/risk → approval where required → broker/adapter → verification → receipt/audit → `FAILED_UNKNOWN` reconciliation.

External content is always untrusted. No adapter may lower risk, no Agent receives raw credentials or unrestricted APIs, and mutation scope is never implied by read access.

## Commissioning prerequisite

Before a provider integration, complete one real Chrome read-only proof and one selected governed real action. These validate the reusable operational and review pattern without prematurely coupling Yusuf OS to a provider.

## 1. Gmail

- **Problem:** inbox triage and follow-up consume attention and fragment work.
- **Owner:** Inbox with Chief of Staff.
- **First slice:** least-privilege read of selected message/thread metadata and bodies; produce cited triage work items.
- **Later mutation:** draft first; send only as a separately governed capability with explicit preview/approval.
- **Critical defenses:** hostile email content, scoped OAuth, attachment isolation, thread/account binding, send verification, duplicate-send prevention.
- **Success:** real inbox items become correctly cited Needs Yusuf/tasks with no raw credential exposure.

## 2. Calendar

- **Problem:** scheduling and operational commitments are not yet part of the daily loop.
- **Owner:** Chief of Staff.
- **First slice:** read selected calendars and surface conflicts/commitments.
- **Later mutation:** propose then create/update one event with approval and postcondition verification.
- **Critical defenses:** attendee privacy, time zones, duplicate events, invitation side effects, scoped calendars.
- **Success:** verified briefing context and one correctly approved scheduling action.

## 3. LinkedIn

- **Problem:** career and marketing research/outreach require a controlled real channel.
- **Owner:** Career or Marketing according to the task.
- **First slice:** use supported, terms-compliant read mechanisms only.
- **Later mutation:** narrowly scoped draft/review; no automated bulk outreach.
- **Critical defenses:** platform terms, account restrictions, untrusted profiles/messages, rate limits, public-reputation consequences.
- **Success:** one real cited research outcome before any mutation is considered.

## 4. WhatsApp

- **Problem:** important conversations can become untracked operational work.
- **Owner:** Inbox.
- **First slice:** supported business/API channel and bounded conversation ingestion, if Yusuf has a legitimate account path.
- **Later mutation:** explicitly approved templated or conversational response with delivery verification.
- **Critical defenses:** consent, contact binding, personal data, template rules, duplicate messages, delivery ambiguity.
- **Success:** a real conversation produces a correctly scoped task; later, one approved response is verifiably delivered.

## 5. Career portals

- **Problem:** application research and submission are repetitive but consequential.
- **Owner:** Career with Research; Reviewer for evidence.
- **First slice:** read-only listing/company research and cited opportunity capture.
- **Later mutation:** one registered portal/form at a time; draft, preview, explicit approval, submit, and verify.
- **Critical defenses:** hostile listings, credential/session authority, document/PII handling, form drift, duplicate applications, anti-automation terms.
- **Success:** a cited opportunity reaches a verified, human-approved application outcome without blind retry.

## Cloud and platform posture

No integration in this roadmap authorizes cloud migration. Always-on workers, remote callbacks, or managed secrets must be justified per slice and designed without weakening localhost/control-plane assumptions.
