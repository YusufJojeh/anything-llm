const { PRINCIPAL_TYPES } = require("../constants");
const { YusufOSError, ErrorCodes } = require("../errors/YusufOSError");

function normalizePrincipal(principal) {
  if (!principal || typeof principal !== "object")
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      "A structured principal is required.",
      { status: 422 }
    );
  if (!Object.values(PRINCIPAL_TYPES).includes(principal.type))
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      "Unknown principal type.",
      { status: 422, details: { type: principal.type } }
    );
  if (
    (typeof principal.id !== "string" && typeof principal.id !== "number") ||
    String(principal.id).trim().length === 0
  )
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      "Principal id is required.",
      { status: 422 }
    );
  return Object.freeze({ type: principal.type, id: String(principal.id) });
}

function assertHumanPrincipal(principal) {
  const normalized = normalizePrincipal(principal);
  if (normalized.type !== PRINCIPAL_TYPES.USER)
    throw new YusufOSError(
      ErrorCodes.UNAUTHORIZED,
      "Only the Yusuf user principal may decide approvals.",
      { status: 403 }
    );
  return normalized;
}

module.exports = { normalizePrincipal, assertHumanPrincipal };
