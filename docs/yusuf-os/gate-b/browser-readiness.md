# Browser Readiness

Phase X prepares the existing Browser Broker for human-assisted live validation without attaching
to or controlling a real browser. The broker remains disabled by default and production form
registration remains empty.

CDP attachment now accepts only a credential-free HTTP discovery endpoint on numeric loopback.
Discovery refuses redirects, boundedly streams `/json/version` (16 KiB maximum), and validates the
final WebSocket target independently: `ws:`, numeric loopback, no credentials/query/fragment, and
one bounded `/devtools/browser/<id>` path segment. The adapter reports only generic availability
metadata. It never launches, profiles, closes, or exports data from Chrome.

Browser mutations additionally fail closed when a session provides only cookie existence without a
concrete independently-derived account label. The prompt regression corpus explicitly covers fake
tool/system messages, hidden DOM, base64, HTML/script, markdown tool calls, malicious mail, and
repository secret-exfiltration instructions. All remain delimited untrusted data and never enter
the trusted system prompt.

Fresh independent review: PASS, P0=0/P1=0/P2=0. Real site/form registration and a live browser
attachment remain operator decisions documented in `memory/HUMAN_ACTION_REQUIRED.md`.

