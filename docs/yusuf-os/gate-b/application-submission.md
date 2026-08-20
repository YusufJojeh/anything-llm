# Phase Q — Application submission seam (end-to-end scenario wiring)

## Why this phase exists

After Sales/Inbox (Phase P), Yusuf described the scenario Yusuf OS should ultimately prove:

```
Job found -> Research -> Career -> Evidence check -> Application prepared -> Needs Yusuf ->
Approval -> Browser -> Submission verification -> Inbox monitors reply -> Career state updated ->
Command Center
```

Reading the existing implementation against this list shows most of the pipeline **already
exists** across prior phases:

| Step | Already built? | Where |
|---|---|---|
| Job found | Yes | `career.record_opportunity` |
| Research | Yes | Phase O (`research.*`), independent of Career |
| Career | Yes | Phase L |
| Evidence check | Yes | Gate E/J evidence + Knowledge |
| **Application prepared** | **No — this phase** | `career.prepare_application` |
| Needs Yusuf / Approval | Yes, generically | Every `REQUIRE_APPROVAL` capability already goes through `ApprovalService` |
| **Browser** | **Existed but never granted to Career** | `browser.submit_form` (Phase I) |
| Submission verification | Yes, generically | `BrowserAdapter.verify()`/`reconcile()` (Phase I) |
| Inbox monitors reply / Career state updated | Yes | Phase P's `inbox.advance_linked_career_status` seam |
| Command Center | Yes, generically | Gate F projections read tasks/runs/approvals/audit, not per-domain |

So this phase is deliberately small: it closes the two genuine gaps (a local "prepared"
checkpoint, and Career actually holding the browser mutation capability) without touching
anything that already works.

## What this phase is

- **`career.prepare_application`** (LOCAL_WRITE, L1, ALLOW) — stores a local-only application
  draft (`applicationNotes`) on an opportunity that is still `RESEARCHING`. This is the "Application
  prepared" / "Needs Yusuf" checkpoint: nothing external happens, and the opportunity's `status`
  does not change. A model can draft as many times as needed before anything risky occurs.
- **Career Agent is granted `browser.submit_form`** — the existing Phase I capability
  (`EXTERNAL_MUTATION`, L3, `REQUIRE_APPROVAL`, independently verified afterward). This is the
  "Approval -> Browser -> Submission verification" step. Granting it to Career is the entire change
  here; the capability's own governance (account-identity binding, page-drift detection, wrong-
  account refusal, `FAILED_UNKNOWN -> reconcile`) is unmodified and unextended.
- Once a real submission succeeds, the existing `career.update_status` moves the opportunity to
  `APPLIED` — no new capability needed for that step, it already existed.
- Once a reply arrives, the existing Phase P Inbox pipeline (`inbox.record_message` ->
  `inbox.classify_message` -> `inbox.advance_linked_career_status`) closes the loop back into
  Career — unmodified from Phase P.
- Command Center's existing generic task/run/approval/audit projections (Gate F) already surface
  all of this activity; no Career-specific Command Center work is needed.

## What this phase is explicitly not

- **Not a real job-application integration.** `formRegistry.js` still ships empty in production
  (Phase I's own deliberate default) and the Browser Broker still defaults to disabled. Granting
  `browser.submit_form` to Career makes the capability *reachable*, not *usable* — nothing submits
  anywhere until Yusuf (a) enables the Browser Broker, (b) registers a real form descriptor for a
  specific job site, and (c) explicitly approves the resulting intent. This mirrors exactly how
  Inbox named `gmail.*` without building them, and how Phase I itself shipped `formRegistry.js`
  empty — building a fake or placeholder form registration now would be exactly the kind of
  premature, untested integration every prior design note has refused to build.
- **Not a new identity-binding mechanism.** `browser.submit_form`'s existing account-identity and
  page-content-drift binding (Phase I) already satisfies the spirit of "bind provider, account,
  and content before mutation" that Yusuf's Sales/Inbox spec described for email. Career does not
  need a bespoke duplicate of that mechanism; it reuses the one governed browser mutation path
  every future browser-mediated integration is meant to share.
- **Not a change to `career.update_status` or Career's transition table.** `RESEARCHING -> APPLIED`
  was already a legal transition before this phase; this phase adds a drafting checkpoint before
  it, nothing more.

## Why `career.prepare_application` never changes status

Mirrors `inbox.prepare_reply`'s reasoning from Phase P: a draft is not a commitment. An opportunity
can be drafted, redrafted, and abandoned any number of times while still `RESEARCHING`; only an
actual verified submission (`browser.submit_form` succeeding, followed by an explicit
`career.update_status` call to `APPLIED`) represents a real-world action taken. Requiring the
opportunity to still be `RESEARCHING` to draft (rather than, say, allowing a draft at any status)
keeps "prepared but not yet applied" an honest, single, unambiguous state rather than letting a
stale draft linger after the opportunity has already moved on.

## Security review checklist

- Server-forced: `career.prepare_application` never accepts a status argument at all — it cannot
  be used to change status, by construction, not just by validation.
- TOCTOU: both the request builder and `CareerAdapter.execute()` independently re-check
  `status === RESEARCHING` against a fresh read before writing.
- Digest: `applicationNotes` is folded into the row's canonical digest alongside every other field,
  so `verify()`/`reconcile()` correctly detect a stale expectation the same way they already do for
  `notes`.
- Capability isolation: no other Agent is granted `career.prepare_application` or
  `browser.submit_form`; `agentRuntimeSecurity.test.js` and `browserBrokerSecurity.test.js` assert
  Career is now the sole exception for the latter.
- `browser.submit_form`'s own governance (Phase I) is unmodified: wrong-account refusal, page-
  drift refusal, `FAILED_UNKNOWN -> reconcile`, independent post-execution verification. Granting
  it to a new Agent role introduces no new bypass, since Policy/Approval/Execution never inspect
  which Agent is calling — only the capability's own registry-defined risk tier.

## Known limitations / non-goals

- No real form is registered; the Browser Broker stays disabled by default (`HUMAN_ACTION_REQUIRED.md`
  §2 unchanged).
- No Career-specific Command Center surfacing — same "backend/mechanism first" pattern as every
  prior phase.
- No retention policy change to `yusuf_career_opportunities.applicationNotes` — same accepted gap
  as every other free-text field in this system.
