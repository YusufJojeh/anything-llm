# Human Action Required

Actions only Yusuf can perform. Everything here blocks a specific capability from being *proven*
or *used* — none of it blocks ordinary local engineering, which continues autonomously.

Do not add ordinary engineering questions to this file.

---

## N. `OPEN_MANUAL_VALIDATION` — live Ollama / OpenAI model runtime [OPEN since 2026-08-21]

**Why it is human-only:** proving `ModelRouter` against a real provider requires either a local
Ollama daemon actually running on this machine, or a real `OPENAI_API_KEY` set in the environment
— both are things only Yusuf can provision (installing/running Ollama, or supplying a billed API
key). The implementing agent does not create accounts or enter credentials.

**What is already proven without it:** every routing policy, provider health/error path, secret-
leakage resistance, and cost/usage confidence rule is covered by deterministic mocked tests
(`server/__tests__/yusufOS/modelRouting/`). Both providers' live smoke tests exist and are gated to
skip gracefully when their dependency is absent — they did skip in this session.

**What is NOT proven:** a real completion round-trip against an actual Ollama daemon or the real
OpenAI API, including real latency/usage numbers and real HTTP error bodies for auth/rate-limit
cases.

**To close this:** either run Ollama locally (`ollama serve`, with at least one model pulled) or
set a real `OPENAI_API_KEY` in the environment, then re-run
`npx jest server/__tests__/yusufOS/modelRouting`.

**Updated 2026-09-06:** the OpenAI half is now closed. Yusuf set a real `OPENAI_API_KEY` in
`server/.env.development` and a single bounded live completion was run directly through
`OpenAIProvider` → `ModelRouter` (module-level; not a full Agent run). Real result: provider
`OPENAI`, served model `gpt-4o-mini-2024-07-18`, latency `3916ms`, usage 16/1/17 tokens
(`KNOWN`), cost `~3 micros` (`ESTIMATED`), no fallback, zero secret-fragment matches in the
result or backend log. See `CURRENT_GATE.md`'s Phase AC update for full detail. **Still open:**
the Ollama half (no local daemon check performed this session — out of scope per explicit
instruction to stop after the OpenAI validation) and `npx jest server/__tests__/yusufOS/modelRouting`
has not been re-run against the now-live key.

---

## 1. `OPEN_MANUAL_VALIDATION` — real unlocked `/os` [OPEN since 2026-08-18]

**Why it is human-only:** reaching the unlocked Command Center requires typing the
`YUSUF_OS_CONTROL_TOKEN` into a browser field. The implementing agent does not enter credentials
into fields, so this cannot be self-served.

**What is already proven without it:** the gateway's auth, CSRF, lock/unlock and drilldown
projections are covered by backend tests; every `/os` surface is covered by frontend tests and by
live measurement against the dev fixture harness.

**What is NOT proven:** the real projections rendering against the real control plane, and a real
SSE connection reaching `LIVE`. **This has not passed and must not be recorded as passing.**

**How to close it:**

```bash
yarn dev:server      # terminal 1
yarn dev:frontend    # terminal 2
```

Open `http://localhost:3000/os`, unlock, and confirm three things:

1. real projections render (all zeros on a clean database is a correct answer);
2. the connection indicator reaches `LIVE` — the least-proven path, since tests stub `EventSource`;
3. a task, a run and an approval each open from the Command Center.

Then say so, and the evidence gets recorded in `GATE_HISTORY.md` and Gate G closes.

**Updated 2026-09-04:** the new Agent Workspace at `/os/agents` (see `CURRENT_GATE.md`'s
"Post-V1" entry) falls under this same open item — its live module graph was confirmed
to load cleanly against a real dev server, but nobody has yet unlocked the session and
exercised it (Department grouping, a real running Agent's console state, tab switching)
against real data. When doing the unlock pass above, also open `/os/agents` and confirm
those specifically.

---

## 2. Browser Broker attachment — opt-in [OPEN, blocks Phase H/I *use*, not their *completion*]

Phases H (read) and I (`browser.submit_form` mutation) are both implemented and tested against
fixtures only. Attaching to a real browser is deliberately off by default and needs three operator
actions (ADR-011):

```bash
# 1. install the optional driver (not a declared server dependency)
cd server && npm install --no-save puppeteer-core

# 2. start Chrome yourself, with a debugging port
#    Yusuf OS connects to this browser; it never launches or profiles one.
chrome --remote-debugging-port=9222

# 3. enable the broker and allowlist exactly the origins it may observe
#    (server/.env.development — never committed)
#    YUSUF_OS_BROWSER_BROKER_ENABLED=true
#    YUSUF_OS_BROWSER_ALLOWED_ORIGINS=https://github.com https://mail.google.com
```

Until then the broker honestly reports `UNAVAILABLE` in System Health.

**Decision still needed from Yusuf:** which origins belong on the allowlist. The repository cannot
answer this — it is a judgement about what Yusuf is willing to let an Agent observe, and for
Phase I, act on.

**Updated 2026-08-20 (Phase Q):** `browser.submit_form` is now granted to the Career Agent
(`career.prepare_application` → approval → `browser.submit_form` is the intended job-application
flow). This grant is a no-op until the three operator actions above are done AND a real form is
registered in `formRegistry.js` (it still ships empty) — until then Career's grant is reachable
but functionally unusable, same as before. **Decision still needed from Yusuf:** which origins
belong on the allowlist, and what the first real form registration should be (which job board /
ATS, and its exact field mapping) — the repository cannot answer either; both are judgement calls
about what Yusuf is willing to let an Agent submit on his behalf.

---

## 3. First real-world pilot [NOT STARTED — needs explicit approval]

Per the continuation brief, the first controlled real-world action should be either a feature-branch
push to a Yusuf-owned repo, or a read-only Gmail inspection. Both are external side effects and
require explicit approval. Nothing has been attempted.

---

## 4. Push / PR / deploy [STANDING — never automatic]

`origin` is Yusuf's fork and `upstream` push is DISABLED. All work is local commits only. Pushing,
opening a PR, merging or deploying always requires Yusuf saying so.
