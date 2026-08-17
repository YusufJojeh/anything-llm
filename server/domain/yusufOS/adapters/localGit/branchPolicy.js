const { YusufOSError, ErrorCodes } = require("../../errors/YusufOSError");

const DEFAULT_PROTECTED_BRANCHES = Object.freeze(["main", "master"]);

// Deliberately stricter than full git-check-ref-format: this only needs to
// accept the branch names a governed feature-branch workflow actually uses,
// not everything Git itself would technically permit.
const VALID_BRANCH_NAME = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/;
const INVALID_BRANCH_SUBSTRINGS = [
  "..",
  "//",
  "@{",
  "\\",
  "~",
  "^",
  ":",
  "?",
  "*",
  "[",
];

function assertValidBranchName(name, field = "branch") {
  if (typeof name !== "string" || name.length === 0)
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `${field} must be a non-empty string.`,
      { status: 422, details: { field } }
    );
  if (name.startsWith("-"))
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `${field} may not begin with '-'; this would be interpreted as a Git option.`,
      { status: 422, details: { field, value: name } }
    );
  if (!VALID_BRANCH_NAME.test(name))
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `${field} contains characters that are not allowed in a governed branch name.`,
      { status: 422, details: { field, value: name } }
    );
  if (INVALID_BRANCH_SUBSTRINGS.some((token) => name.includes(token)))
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `${field} contains a disallowed Git ref sequence.`,
      { status: 422, details: { field, value: name } }
    );
  if (name.endsWith(".lock") || name.endsWith(".") || name.endsWith("/"))
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `${field} has a disallowed suffix.`,
      { status: 422, details: { field, value: name } }
    );
  if (name.split("/").some((segment) => segment.startsWith(".")))
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `${field} may not have a path segment beginning with '.'.`,
      { status: 422, details: { field, value: name } }
    );
  return name;
}

// Deliberately more permissive than assertValidBranchName (allows `~`, `^`
// for expressions like HEAD~1) but still forbids range/double-dot syntax
// (`a..b`, `a...b`) and reflog syntax (`@{...}`) — Gate D's read
// capabilities inspect one revision at a time, not arbitrary revision
// ranges, which keeps the argument surface passed to Git small and reviewable.
const VALID_REVISION = /^[A-Za-z0-9][A-Za-z0-9._/~^-]{0,199}$/;

function assertValidRevision(ref, field = "ref") {
  if (typeof ref !== "string" || ref.length === 0)
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `${field} must be a non-empty string.`,
      { status: 422, details: { field } }
    );
  if (ref.startsWith("-"))
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `${field} may not begin with '-'; this would be interpreted as a Git option.`,
      { status: 422, details: { field, value: ref } }
    );
  if (!VALID_REVISION.test(ref) || ref.includes("..") || ref.includes("@{"))
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `${field} is not a single allowed revision expression.`,
      { status: 422, details: { field, value: ref } }
    );
  return ref;
}

function normalizedProtectedBranches(protectedBranches) {
  const configured = Array.isArray(protectedBranches) ? protectedBranches : [];
  return new Set([...DEFAULT_PROTECTED_BRANCHES, ...configured]);
}

function isProtectedBranch(name, protectedBranches) {
  return normalizedProtectedBranches(protectedBranches).has(name);
}

module.exports = {
  DEFAULT_PROTECTED_BRANCHES,
  assertValidBranchName,
  assertValidRevision,
  isProtectedBranch,
  normalizedProtectedBranches,
};
