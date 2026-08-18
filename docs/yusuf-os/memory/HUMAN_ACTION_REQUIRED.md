# Human Action Required

Actions only Yusuf can perform. Everything here blocks a specific capability from being *proven*
or *used* — none of it blocks ordinary local engineering, which continues autonomously.

Do not add ordinary engineering questions to this file.

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

---

## 2. Browser Broker attachment — opt-in [OPEN, blocks Phase H *use*, not Phase H *completion*]

Phase H is implemented and tested against fixtures. Attaching to a real browser is deliberately
off by default and needs three operator actions (ADR-011):

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
answer this — it is a judgement about what Yusuf is willing to let an Agent observe.

---

## 3. First real-world pilot [NOT STARTED — needs explicit approval]

Per the continuation brief, the first controlled real-world action should be either a feature-branch
push to a Yusuf-owned repo, or a read-only Gmail inspection. Both are external side effects and
require explicit approval. Nothing has been attempted.

---

## 4. Push / PR / deploy [STANDING — never automatic]

`origin` is Yusuf's fork and `upstream` push is DISABLED. All work is local commits only. Pushing,
opening a PR, merging or deploying always requires Yusuf saying so.
