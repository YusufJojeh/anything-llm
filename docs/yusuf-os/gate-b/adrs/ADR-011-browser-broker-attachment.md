# ADR-011: Browser Broker attachment mechanism (read-only first slice)

- Status: Accepted for Phase H
- Supersedes the open question left by [ADR-005](ADR-005-browser-first-local-tool-first.md)
  ("Browser bridge is contract-only until a safe attachment mechanism is selected")

## Context

ADR-005 committed to Browser-First — prefer Yusuf's existing authenticated Chrome session over
forcing new API credentials — but deliberately did not pick *how* to attach, because the wrong
attachment mechanism would hand an Agent the user's whole browser.

`adapter-governance.md` §2 already fixes the requirements: explicit opt-in, never copy or export
cookies/tokens/profile data, expose only safe account/origin metadata, allowlist origins, separate
observation from submission, typed operations rather than raw CDP/JavaScript, and fail closed when
identity cannot be established.

## Decision

**Attach over the Chrome DevTools Protocol to a browser the operator launched himself, with a
read-only typed capability surface, behind a triple opt-in.**

All three must hold before the broker will attach:

1. `YUSUF_OS_BROWSER_BROKER_ENABLED=true` — off by default.
2. `puppeteer-core` is installed. It is **not** a declared dependency of the server; the driver
   `require`s it lazily and reports `UNAVAILABLE` if absent. A default Yusuf OS install therefore
   carries no browser-automation attack surface at all.
3. Chrome is already running with `--remote-debugging-port`, started by Yusuf. The broker
   **connects**; it never launches a browser and never creates a profile.

`puppeteer-core` rather than `puppeteer`: it downloads no Chromium and can only connect to a
browser that already exists, which is exactly the authority we want.

### What the broker exposes

Only typed, read-only capabilities. Agents never receive a page handle, a CDP session, or an
`evaluate()`:

| Capability | Risk | Returns |
|---|---|---|
| `browser.list_tabs` | L0 | tab id, origin, title — allowlisted origins only |
| `browser.get_current_url` | L0 | origin + path, query and fragment stripped |
| `browser.get_active_account_identity` | L1 | `authenticated`/`unknown` + a safe account label |
| `browser.read_visible_text` | L1 | sanitized visible text |
| `browser.read_structured_page` | L1 | sanitized headings/links/landmarks |
| `browser.capture_safe_page_state` | L1 | the above plus a content digest |

No `browser.click`, no `browser.execute_js`, no `browser.submit`, no navigation. Mutation is
Phase I and arrives as *semantic* capabilities (`gmail.send_reply`), never as a generic clicker.

### Driver abstraction

`BrowserDriver` has two implementations:

- `CdpBrowserDriver` — the real attachment described above.
- `FixtureBrowserDriver` — deterministic local HTML fixtures. Every test in this phase runs on it,
  so the suite needs no browser, no network and no account.

The adapter, origin policy and sanitizer are identical on both paths, so what the tests exercise is
the real governance code.

## Why not the alternatives

- **Launch our own browser / isolated profile.** ADR-005 defers this; it also defeats Browser-First
  (a fresh profile is not authenticated) and would make Yusuf OS the owner of a credential store.
- **The AnythingLLM browser extension.** Larger surface, and its endpoints are governed by
  AnythingLLM's auth, which §1 of the API contract says is not valid authority for Yusuf OS.
- **Raw CDP exposed as a capability.** Explicitly forbidden by `adapter-governance.md` §2 and
  equivalent to `unrestricted_shell_with_secrets`.

## Consequences

- Page content is **untrusted input**. The sanitizer strips scripts/styles, separates hidden text
  from visible text, caps size, redacts secret-shaped strings, and wraps everything in an envelope
  that marks provenance. A page can never issue instructions to Yusuf OS.
- Cookies, storage, credentials and profile files are never read. `browser.cookie.export` and
  `browser.session_token.export` remain `HARD_FORBIDDEN` in the code-owned registry.
- Origins are allowlisted and fail closed: an unknown origin is refused, not observed.
- Account identity is *reported*, never *derived from* page text an attacker controls.
- Because attachment requires a user-launched browser, Yusuf OS cannot claim 24/7 browser
  capability. That limit is recorded honestly rather than engineered around.
