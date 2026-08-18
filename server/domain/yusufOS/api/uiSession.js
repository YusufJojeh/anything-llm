const { randomBytes, timingSafeEqual } = require("crypto");
const { ErrorCodes } = require("../errors/YusufOSError");
const { isLocalRequest, sendError, safeEqual } = require("./controlPlaneGuard");

/**
 * Browser bootstrap for the Yusuf OS control plane (Gate G).
 *
 * The control plane authenticates with `Authorization: Bearer
 * YUSUF_OS_CONTROL_TOKEN`. A browser cannot hold that secret safely — putting
 * it in localStorage, a query string, or a bundled constant would be strictly
 * worse than what exists today. So the browser never holds it.
 *
 * Instead the operator unlocks once per session: the token is POSTed over the
 * loopback interface, compared with `timingSafeEqual` against the *same*
 * env-configured secret the bearer guard uses, and exchanged for a short-lived
 * server-side session referenced only by an httpOnly, SameSite=Strict cookie.
 *
 * This is deliberately an *additional* bootstrap, never a relaxation:
 *
 * - same secret, same comparison, same minimum length as the bearer guard;
 * - same loopback-only requirement, including the "no forwarding headers" rule;
 * - sessions live in process memory only, so a restart re-locks;
 * - both an idle and an absolute expiry, neither renewable past the absolute;
 * - a double-submit CSRF token required on every state-changing request, held
 *   only in the `/os` bundle's memory (never a cookie, never storage);
 * - `/api/yusuf-os/*` and its bearer guard are untouched.
 */

const COOKIE_NAME = "yusuf_os_ui";
const COOKIE_PATH = "/api/yusuf-os-ui";
const IDLE_TTL_MS = 30 * 60 * 1000;
const ABSOLUTE_TTL_MS = 12 * 60 * 60 * 1000;
const CSRF_HEADER = "x-yusuf-csrf";
// Paths served *before* a session exists. Everything else requires one.
const UNGUARDED_PATHS = Object.freeze(new Set(["/session"]));
const STATE_CHANGING_METHODS = Object.freeze(
  new Set(["POST", "PUT", "PATCH", "DELETE"])
);

// Single-operator control plane: one live session at a time. Unlocking again
// (or from another tab) replaces the previous session rather than accumulating
// credentials that nobody can enumerate or revoke.
let activeSession = null;

function now() {
  return Date.now();
}

function isExpired(session, at = now()) {
  if (!session) return true;
  return at > session.absoluteExpiresAt || at > session.idleExpiresAt;
}

function clearSession() {
  activeSession = null;
}

function currentSession() {
  if (isExpired(activeSession)) clearSession();
  return activeSession;
}

function createSession() {
  const at = now();
  activeSession = {
    id: randomBytes(32).toString("hex"),
    csrfToken: randomBytes(32).toString("hex"),
    createdAt: at,
    idleExpiresAt: at + IDLE_TTL_MS,
    absoluteExpiresAt: at + ABSOLUTE_TTL_MS,
  };
  return activeSession;
}

/**
 * Constant-time cookie comparison. A plain `===` on a session id leaks a
 * timing oracle in exactly the same way it would on the bearer token.
 */
function sessionMatches(session, presented) {
  if (!session || typeof presented !== "string" || !presented.length)
    return false;
  const left = Buffer.from(session.id, "utf8");
  const right = Buffer.from(presented, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

function readCookie(request, name) {
  const header = request.headers?.cookie;
  if (typeof header !== "string" || !header.length) return null;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() !== name) continue;
    return decodeURIComponent(part.slice(index + 1).trim());
  }
  return null;
}

function setSessionCookie(response, session) {
  const attributes = [
    `${COOKIE_NAME}=${session.id}`,
    `Path=${COOKIE_PATH}`,
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${Math.floor(ABSOLUTE_TTL_MS / 1000)}`,
  ];
  if (process.env.ENABLE_HTTPS) attributes.push("Secure");
  response.setHeader("Set-Cookie", attributes.join("; "));
}

function clearSessionCookie(response) {
  response.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; Path=${COOKIE_PATH}; HttpOnly; SameSite=Strict; Max-Age=0`
  );
}

/**
 * Guards every `/api/yusuf-os-ui/*` route except the unlock endpoint itself.
 *
 * Enforces, in order: loopback origin, a live unexpired session, and — for
 * anything that can change state — the double-submit CSRF token.
 */
function yusufUiSessionGuard(request, response, next) {
  if (!isLocalRequest(request))
    return sendError(
      response,
      403,
      ErrorCodes.LOCALHOST_REQUIRED,
      "Yusuf OS control-plane access is restricted to a verified local connection."
    );

  if (UNGUARDED_PATHS.has(request.path)) return next();

  const session = currentSession();
  const presented = readCookie(request, COOKIE_NAME);
  if (!session || !sessionMatches(session, presented)) {
    clearSessionCookie(response);
    return sendError(
      response,
      401,
      ErrorCodes.UNAUTHORIZED,
      "Yusuf OS is locked. Unlock the control plane to continue.",
      { locked: true }
    );
  }

  if (STATE_CHANGING_METHODS.has(request.method)) {
    const presentedCsrf = request.headers?.[CSRF_HEADER];
    if (!safeEqual(presentedCsrf, session.csrfToken))
      return sendError(
        response,
        403,
        ErrorCodes.UNAUTHORIZED,
        "Missing or invalid Yusuf OS request token."
      );
  }

  // Sliding idle window, hard-capped by the absolute expiry so an always-open
  // tab cannot hold a session indefinitely.
  session.idleExpiresAt = Math.min(
    now() + IDLE_TTL_MS,
    session.absoluteExpiresAt
  );
  response.locals.yusufOS = response.locals.yusufOS || {};
  response.locals.yusufOS.uiSession = { id: session.id };
  return next();
}

/**
 * Registers the unlock/status/lock routes. These are mounted under the same
 * `/api/yusuf-os-ui` prefix and are the only paths the guard lets through
 * without a session.
 */
function yusufUiSessionEndpoints(app, { basePath = "/yusuf-os-ui" } = {}) {
  if (!app) return;

  app.get(`${basePath}/session`, (request, response) => {
    if (!isLocalRequest(request))
      return sendError(
        response,
        403,
        ErrorCodes.LOCALHOST_REQUIRED,
        "Yusuf OS control-plane access is restricted to a verified local connection."
      );
    const session = currentSession();
    const presented = readCookie(request, COOKIE_NAME);
    const unlocked = sessionMatches(session, presented);
    return response.status(200).json({
      unlocked,
      // Distinguishes "you must unlock" from "this deployment has no control
      // token configured at all", which is an operator problem, not a login.
      configured:
        typeof process.env.YUSUF_OS_CONTROL_TOKEN === "string" &&
        process.env.YUSUF_OS_CONTROL_TOKEN.length >= 32,
      csrfToken: unlocked ? session.csrfToken : null,
      expiresAt: unlocked
        ? new Date(session.absoluteExpiresAt).toISOString()
        : null,
    });
  });

  app.post(`${basePath}/session`, (request, response) => {
    if (!isLocalRequest(request))
      return sendError(
        response,
        403,
        ErrorCodes.LOCALHOST_REQUIRED,
        "Yusuf OS control-plane access is restricted to a verified local connection."
      );

    // A cross-site form post cannot set this content type without preflight,
    // which the SameSite=Strict cookie and unknown token already defeat. This
    // is belt-and-braces so the unlock route is never a simple request.
    const contentType = String(request.headers?.["content-type"] || "");
    if (!contentType.toLowerCase().startsWith("application/json"))
      return sendError(
        response,
        415,
        ErrorCodes.VALIDATION_ERROR,
        "Yusuf OS unlock requires a JSON request body."
      );

    const configuredToken = process.env.YUSUF_OS_CONTROL_TOKEN;
    if (typeof configuredToken !== "string" || configuredToken.length < 32)
      return sendError(
        response,
        503,
        ErrorCodes.UNAUTHORIZED,
        "Yusuf OS control-plane authentication is not securely configured."
      );

    const presented = request.body?.controlToken;
    if (typeof presented !== "string" || !safeEqual(presented, configuredToken))
      return sendError(
        response,
        401,
        ErrorCodes.UNAUTHORIZED,
        "Valid Yusuf OS control-plane authentication is required."
      );

    const session = createSession();
    setSessionCookie(response, session);
    return response.status(200).json({
      unlocked: true,
      configured: true,
      // The CSRF token is returned in the body precisely so it lives in the
      // page's memory rather than in a cookie a cross-site request replays.
      csrfToken: session.csrfToken,
      expiresAt: new Date(session.absoluteExpiresAt).toISOString(),
    });
  });

  app.delete(`${basePath}/session`, (request, response) => {
    if (!isLocalRequest(request))
      return sendError(
        response,
        403,
        ErrorCodes.LOCALHOST_REQUIRED,
        "Yusuf OS control-plane access is restricted to a verified local connection."
      );
    const session = currentSession();
    const presented = readCookie(request, COOKIE_NAME);
    // Locking is only honoured from the session that actually holds the
    // cookie, so a cross-site request cannot log the operator out.
    if (sessionMatches(session, presented)) clearSession();
    clearSessionCookie(response);
    return response.status(200).json({ unlocked: false });
  });
}

module.exports = {
  COOKIE_NAME,
  COOKIE_PATH,
  CSRF_HEADER,
  IDLE_TTL_MS,
  ABSOLUTE_TTL_MS,
  yusufUiSessionGuard,
  yusufUiSessionEndpoints,
  // Test seams — never used by request handling.
  __clearSession: clearSession,
  __currentSession: currentSession,
};
