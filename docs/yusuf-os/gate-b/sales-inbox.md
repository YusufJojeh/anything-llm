# Phase P — Sales/Inbox

## Problem

Yusuf has no durable place to track inbound messages (recruiter replies, interview requests,
rejections, bounces, sales/opportunity leads) or to prepare a reply without that reply becoming a
real sent email. This is the first phase that gets structurally close to real external
communication — the design bar here is higher than any prior tracking phase.

## What this phase is

A durable, honest record of inbound messages and their triage state, plus **local-only** reply
drafting. The Inbox Agent classifies messages (a judgment call, like Knowledge's asserted facts)
and, when a message is clearly Career-relevant, moves an **existing, already-linked** Career
opportunity forward using the Career domain's own governed capability — never a second Career
database.

## What this phase is explicitly not

- **Not a live email connection.** There is no Gmail/IMAP/SMTP adapter. `inbox.record_message` is
  how a message enters Yusuf OS (an operator, an ingestion job, or a future provider adapter calls
  it) — it is not itself "fetching mail."
- **Not sending, replying, forwarding, archiving-for-real, or applying a real label.** Those are
  L3 external mutations against a real provider and are explicitly **deferred** to a future phase
  once a real account-bound provider adapter exists (`gmail.send_reply`, `gmail.archive_thread`,
  `gmail.apply_label` — named now only so a future phase doesn't reinvent naming). This phase does
  not implement them, grant them, or reach them. `inbox.archive_local`'s status name is deliberately
  suffixed `_local` so it is never mistaken for `gmail.archive_thread` in code, logs, or the
  Command Center.
- **Not a second Career database.** Inbox never creates Career rows. See "Career integration seam"
  below.

## Capability design: read vs. local-write vs. deferred external-mutation

| Capability | Class | Risk | Outcome | Notes |
|---|---|---|---|---|
| `inbox.list_messages` | READ | L0 | ALLOW | by uuid or status |
| `inbox.read_message` | READ | L0 | ALLOW | by uuid |
| `inbox.record_message` | LOCAL_WRITE | L1 | ALLOW | ingests one message; always starts `NEW` |
| `inbox.classify_message` | LOCAL_WRITE | L1 | ALLOW | sets a closed-enum classification + status |
| `inbox.archive_local` | LOCAL_WRITE | L1 | ALLOW | local bookkeeping only, never a real archive |
| `inbox.prepare_reply` | LOCAL_WRITE | L2 | ALLOW | stores a draft; never sends |
| `gmail.send_reply` (future) | EXTERNAL_MUTATION | L3+ | REQUIRE_APPROVAL | **not built this phase** |
| `gmail.archive_thread` (future) | EXTERNAL_MUTATION | L3 | REQUIRE_APPROVAL | **not built this phase** |
| `gmail.apply_label` (future) | EXTERNAL_MUTATION | L1-L2 | depends | **not built this phase** |

`inbox.prepare_reply` is placed at **L2** rather than L1 — one step above every other local-write
tracking capability in Yusuf OS so far — because drafted reply *content* is qualitatively different
from a status field: it is prose that, if a future phase's send capability is built carelessly,
could be sent as-is. L2 does not currently gate anything differently from L1 in the Policy engine
today (both `ALLOW` by default per the registry), but the classification is recorded now so that
if a future policy tier introduces stricter defaults at L2, `prepare_reply` inherits it
automatically rather than needing a reclassification later.

## Data model

`yusuf_inbox_messages`: `uuid`, `sender`, `subject`, `snippet` (body preview — redacted for
persistence like every other governed write), `classification` (nullable until classified:
`OPPORTUNITY`/`INTERVIEW`/`REJECTION`/`BOUNCE`/`OTHER`), `status`
(`NEW`/`TRIAGED`/`DRAFTED`/`ARCHIVED_LOCAL`), `draftReplyBody` (nullable), `linkedCareerOpportunityUuid`
(nullable — set only by `inbox.classify_message` when the Agent supplies a uuid that already
exists in `yusuf_career_opportunities`; validated, never a raw foreign key), `digest`, principal
attribution, timestamps.

## Transition table

```
NEW            -> TRIAGED, ARCHIVED_LOCAL
TRIAGED        -> TRIAGED (reclassify), DRAFTED, ARCHIVED_LOCAL
DRAFTED        -> ARCHIVED_LOCAL
ARCHIVED_LOCAL -> (terminal)
```

`TRIAGED -> TRIAGED` (reclassification) is the one non-strictly-forward edge, and it is a
self-loop, not a true backward edge — an initial classification guess can be revised without ever
un-drafting a reply or reviving an archived message. `ARCHIVED_LOCAL` is the only terminal state;
reviving an archived thread is a new `inbox.record_message` row (same discipline as every other
tracking phase's terminal state).

## Why `detect_interview`/`detect_rejection`/`detect_bounce`/`extract_opportunity` are not separate capabilities

The original brief for this phase named `inbox.detect_interview`, `inbox.detect_rejection`,
`inbox.detect_bounce`, and `inbox.extract_opportunity` as distinct capabilities. This design
collapses all four into **outcomes of one capability**, `inbox.classify_message`, whose
`classification` argument is a closed enum (`OPPORTUNITY`/`INTERVIEW`/`REJECTION`/`BOUNCE`/
`OTHER`). Reasoning, made explicit here rather than left implicit:

- All four "detect" actions have the identical shape — the model reads a message and asserts one
  judgment from a closed set, exactly like Knowledge's `knowledge.write`. Four capabilities that
  differ only in which enum value they're allowed to assert is capability-surface inflation without
  a corresponding security or auditability benefit — the registry, the policy engine, and the
  security test suite would all carry four near-identical entries instead of one.
  Yusuf's own review note for this phase warned specifically against building "dozens of Agents
  before the existing ones are wired end-to-end" — the same discipline applies to capabilities
  within one Agent.
- A single capability makes the security review surface *smaller*, not larger: one request
  builder, one adapter branch, one set of tests to prove the classification enum is closed and the
  Career linkage is validated — instead of four copies of the same proof.
- If a future need arises for a `classification` value to carry materially different validation or
  a different risk tier than the others (for example, if `OPPORTUNITY` classification should
  itself require approval before any Career linkage), splitting that one value out into its own
  capability at that point is a small, well-scoped change — not a redesign.

`extract_opportunity`'s original intent (pull structured fields for a Career opportunity out of a
message) is served by: `inbox.classify_message` sets `classification: "OPPORTUNITY"` and may supply
`linkedCareerOpportunityUuid`; the *actual* Career fields (company/role) are recorded by the
existing `career.record_opportunity` capability, called by whichever Agent is appropriate (see
below) — never invented anew inside Inbox.

## Career integration seam — how this avoids a second Career database

**Revision note (post-review):** the first version of this design granted Inbox the raw
`career.update_status` capability directly. Independent review flagged this as a real gap
(P1): `career.update_status`'s request builder accepts any opportunity uuid with no awareness
of whether it was ever linked from an inbox message — the "seam" was enforced only by the
Agent's own instructions, not by Policy or the request builder, which violates the system's own
invariant that no agent may cause a side effect without passing through code-owned validation.
The design below is the corrected version: Inbox is never granted `career.update_status`; it is
granted a new, narrower capability that enforces the linkage in code.

The Inbox Agent is granted **`inbox.advance_linked_career_status`** (a new capability owned by
this phase, not a grant of an existing Career capability), in addition to its own `inbox.*`
capabilities. This is the entire integration seam:

- Inbox is **not** granted `career.record_opportunity` or `career.update_status`. It can never
  create a new Career row, and it can never move an arbitrary opportunity by uuid — only Yusuf
  (via the Career Agent, or directly) decides a new opportunity exists, and only a
  legitimately-linked message can move one forward. This is the concrete mechanism that prevents
  "a second Career database": there is only one table (`yusuf_career_opportunities`), one
  creation path, and Inbox cannot reach either the creation path or an arbitrary-uuid update
  path.
- `inbox.advance_linked_career_status` takes an **inbox message uuid**, not a career opportunity
  uuid — there is no argument through which a caller can name a different opportunity than the
  one that message is actually linked to. The request builder (`buildAdvanceLinkedCareerStatusRequest`)
  reads the message, requires `linkedCareerOpportunityUuid` to be set and the message's
  `classification` to be `INTERVIEW` or `REJECTION`, resolves the opportunity from that linkage,
  and validates the transition against the career transition table — all server-side, none of it
  left to the model's judgment. `InboxAdapter.execute()` re-derives and re-checks every one of
  these facts independently against fresh reads at execute time (message linkage, classification,
  opportunity existence, transition legality) before writing, the same defense-in-depth placement
  used by every other governed write in this phase.
- This is the first Agent in Yusuf OS granted a capability that writes to a domain other than its
  own department's table — a deliberate, narrow, single-capability exception, not a precedent for
  Agents freely reaching into each other's domains. It is called out explicitly in the security
  review checklist below and in `agentRuntimeSecurity.test.js` as an intentional exception, not an
  isolation gap. Unlike the original design, this exception is enforced by code (the request
  builder and adapter recheck), not by convention.
- No handoff-service change was needed for this seam — `inbox.advance_linked_career_status` is a
  normal governed capability reachable through the standard `YusufActionBoundary` pipeline, so a
  single capability grant on Inbox's role definition is sufficient. This keeps the integration
  entirely inside the existing capability/Policy machinery rather than inventing a second
  delegation mechanism alongside the existing Handoff system.

## Untrusted content handling

`subject`/`snippet`/`draftReplyBody` are external, attacker-influenceable text (an email's content
is not Yusuf's own assertion). Two existing protections already cover this without new code:

1. **Structured output contracts** (`agents/contracts.js`, Gate E) already reject any
   authority-bearing field (risk, approval, verification, task status, review verdict, agent
   identity) at any nesting depth in model output — so even if a malicious email's body contains
   text engineered to look like a tool instruction, the model's *output* carrying that instruction
   still cannot smuggle an authority field into a state transition.
2. **`redactForPersistence`** (`security/redaction.js`, already used by every governed write) is
   applied to `subject`/`snippet`/`draftReplyBody` before they are persisted, stripping any
   token/secret-shaped material an email might contain (e.g. a phishing email embedding a fake
   bearer token) before it ever reaches the database or an audit record.

No new sanitizer was written for this phase — this is a deliberate reuse decision, not an
oversight, and is called out for the reviewer to confirm holds.

## Sends/replies/mutations review checklist (for the *next* phase that builds them)

Recorded here now, before the surface exists, so the next phase's design note and review can be
graded against it rather than reinventing the list: wrong-account send, wrong-thread reply,
recipient substitution, BCC/CC injection, reply-all expansion, HTML/prompt injection in the
composed body, malicious email content used to manipulate the sending Agent, attachment/path
leakage, duplicate send, `FAILED_UNKNOWN` send handling (must resolve to `RECONCILE`, never a blind
retry), message-id spoofing, a draft mistaken for sent, model-generated recipient lists, auto-send
from an `AUTONOMOUS` Agent (must be structurally impossible — autonomy level must never imply L3
grant), and scheduled-send bypassing approval. **None of these apply to this phase** because this
phase builds no send capability at all — they are recorded as the acceptance bar for whichever
future phase does.

## Risk levels

All ALLOW at L0-L2 (this phase adds no `REQUIRE_APPROVAL`/`FORBIDDEN` capability — that only
arrives with a real send capability).

## Known limitations

- No real email provider connection — `inbox.record_message` is a manual/system ingestion path
  only.
- No attachments modeled — deferred entirely; adding them requires its own path-leakage review.
- No retention policy on `yusuf_inbox_messages` — same accepted gap as every other Phase J-O table.
- No Command Center UI surfacing.
- `inbox.prepare_reply`'s L2 classification is not yet policy-differentiated from L1 — recorded for
  forward-compatibility, not a current behavior change.

## Non-goals

Automated email fetching or sending; attachment handling; any `gmail.*` capability; a
second/duplicate Career table or creation path; NLP-based auto-classification (the model classifies
using its own reasoning over the message content it's given — there is no separate ML pipeline).
