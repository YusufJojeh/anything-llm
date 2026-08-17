const { timingSafeEqual } = require("crypto");
const { ErrorCodes } = require("../errors/YusufOSError");

const LOOPBACKS = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const MAX_CONTROL_PLANE_BODY_BYTES = 256 * 1024;

function sendError(response, status, code, message, details = {}) {
  return response.status(status).json({
    error: {
      code,
      message,
      details,
      requestId: response.locals.yusufOS?.requestId || null,
    },
  });
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""), "utf8");
  const rightBuffer = Buffer.from(String(right || ""), "utf8");
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function isLocalRequest(request) {
  const remoteAddress = request.socket?.remoteAddress;
  if (!LOOPBACKS.has(remoteAddress)) return false;

  const forwarded =
    request.headers?.["x-forwarded-for"] ||
    request.headers?.["forwarded"] ||
    request.headers?.["x-real-ip"];
  return !forwarded;
}

function yusufControlPlaneGuard(request, response, next) {
  if (!isLocalRequest(request))
    return sendError(
      response,
      403,
      ErrorCodes.LOCALHOST_REQUIRED,
      "Yusuf OS control-plane access is restricted to a verified local connection."
    );

  const configuredToken = process.env.YUSUF_OS_CONTROL_TOKEN;
  if (typeof configuredToken !== "string" || configuredToken.length < 32)
    return sendError(
      response,
      503,
      ErrorCodes.UNAUTHORIZED,
      "Yusuf OS control-plane authentication is not securely configured."
    );
  const authorization = request.headers?.authorization || "";
  const [scheme, token] = authorization.split(" ");
  if (scheme !== "Bearer" || !safeEqual(token, configuredToken))
    return sendError(
      response,
      401,
      ErrorCodes.UNAUTHORIZED,
      "Valid Yusuf OS control-plane authentication is required."
    );

  const contentLength = Number(request.headers?.["content-length"] || 0);
  if (
    !Number.isFinite(contentLength) ||
    contentLength < 0 ||
    contentLength > MAX_CONTROL_PLANE_BODY_BYTES
  )
    return sendError(
      response,
      413,
      ErrorCodes.VALIDATION_ERROR,
      "Yusuf OS control-plane request body is too large."
    );
  return next();
}

function yusufBodyParserError(error, _request, response, next) {
  if (!error) return next();
  if (error.type === "entity.too.large")
    return sendError(
      response,
      413,
      ErrorCodes.VALIDATION_ERROR,
      "Yusuf OS control-plane request body is too large."
    );
  if (error.type === "entity.parse.failed")
    return sendError(
      response,
      422,
      ErrorCodes.VALIDATION_ERROR,
      "Yusuf OS request body is not valid JSON."
    );
  return next(error);
}

module.exports = {
  LOOPBACKS,
  MAX_CONTROL_PLANE_BODY_BYTES,
  safeEqual,
  isLocalRequest,
  sendError,
  yusufControlPlaneGuard,
  yusufBodyParserError,
};
