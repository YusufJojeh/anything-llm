/**
 * Yusuf OS control-plane client.
 *
 * Security notes that are load-bearing, not commentary:
 *
 * - The base is a **relative** path, deliberately ignoring `VITE_API_BASE`.
 *   The session cookie is host-scoped and `SameSite=Strict`; going through the
 *   same origin (a Vite dev proxy in development, the same server in
 *   production) is what lets the browser send it without CORS credentials
 *   being opened up.
 * - The control token is never held here. The browser holds an opaque httpOnly
 *   session cookie it cannot read, plus a CSRF token that lives only in this
 *   module's memory — never `localStorage`, never a URL, never a log line.
 * - Errors are normalized to a small shape. Server text is surfaced only from
 *   the structured `error.message` field; nothing renders a stack.
 */

export const YUSUF_OS_BASE = "/api/yusuf-os-ui";
const CSRF_HEADER = "x-yusuf-csrf";

// Module-memory only. Cleared on lock and on any 401.
let csrfToken = null;
const lockListeners = new Set();

export function setCsrfToken(token) {
  csrfToken = typeof token === "string" && token.length ? token : null;
}

export function hasCsrfToken() {
  return csrfToken !== null;
}

/** Notified when the server tells us the session is gone, so the UI can lock. */
export function onSessionLost(listener) {
  lockListeners.add(listener);
  return () => lockListeners.delete(listener);
}

function announceSessionLost() {
  csrfToken = null;
  for (const listener of lockListeners) {
    try {
      listener();
    } catch {
      /* a broken listener must not break the request path */
    }
  }
}

export class YusufApiError extends Error {
  constructor(message, { status = 0, code = "UNKNOWN", details = {} } = {}) {
    super(message);
    this.name = "YusufApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function parseError(response) {
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  const error = payload?.error || {};
  return new YusufApiError(
    typeof error.message === "string" && error.message.length
      ? error.message
      : `Request failed (${response.status}).`,
    {
      status: response.status,
      code: typeof error.code === "string" ? error.code : "UNKNOWN",
      details:
        error.details && typeof error.details === "object" ? error.details : {},
    }
  );
}

async function call(path, { method = "GET", body, signal } = {}) {
  const headers = {};
  const isWrite = method !== "GET" && method !== "HEAD";
  if (body !== undefined) headers["content-type"] = "application/json";
  if (isWrite && csrfToken) headers[CSRF_HEADER] = csrfToken;

  let response;
  try {
    response = await fetch(`${YUSUF_OS_BASE}${path}`, {
      method,
      headers,
      // Same-origin only: this never becomes a cross-site credentialed call.
      credentials: "same-origin",
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (cause) {
    if (cause?.name === "AbortError") throw cause;
    throw new YusufApiError("Yusuf OS is unreachable.", {
      code: "NETWORK_UNREACHABLE",
    });
  }

  if (response.status === 401) {
    const error = await parseError(response);
    announceSessionLost();
    throw error;
  }
  if (!response.ok) throw await parseError(response);
  if (response.status === 204) return null;
  return response.json();
}

export const yusufApi = {
  /** Session state. Never returns or accepts the control token itself. */
  sessionStatus: (options) => call("/session", options),
  unlock: (controlToken) =>
    call("/session", { method: "POST", body: { controlToken } }),
  lock: () => call("/session", { method: "DELETE" }),

  dashboard: (options) => call("/dashboard", options),
  runtime: (options) => call("/runtime", options),
  events: (after, limit = 100) =>
    call(`/events?after=${encodeURIComponent(after)}&limit=${limit}`),
  roster: (options) => call("/agents/roster", options),
  projects: (options) => call("/projects", options),
  tasks: (options) => call("/tasks", options),
  taskDetail: (taskId, options) =>
    call(`/tasks/${encodeURIComponent(taskId)}/detail`, options),
  runs: (options) => call("/runs", options),
  runDetail: (runId, options) =>
    call(`/runs/${encodeURIComponent(runId)}/detail`, options),
  approvals: (status, options) =>
    call(
      `/approvals${status ? `?status=${encodeURIComponent(status)}` : ""}`,
      options
    ),
  approvalReview: (approvalId, options) =>
    call(`/approvals/${encodeURIComponent(approvalId)}/review`, options),

  /**
   * The one mutation the Command Center performs. It posts to the *existing*
   * approval decision route with the exact concurrency values the server
   * handed out — the UI never authors approval state, and a drifted intent is
   * still rejected server-side.
   */
  decideApproval: (approvalRouteId, decision) =>
    call(`/approvals/${approvalRouteId}/decisions`, {
      method: "POST",
      body: decision,
    }),

  checkAuditIntegrity: () => call("/audit-integrity/check", { method: "POST" }),
};

/** SSE endpoint. `EventSource` sends the session cookie on a same-origin URL. */
export function eventStreamUrl(after) {
  const cursor = Number.isFinite(Number(after)) ? Number(after) : 0;
  return `${YUSUF_OS_BASE}/events/stream?after=${cursor}`;
}
