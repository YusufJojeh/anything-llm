const fs = require("fs");
const path = require("path");
const { YusufOSError, ErrorCodes } = require("../../errors/YusufOSError");

// Matched against the final path segment (basename), case-insensitively.
// Denies staging of anything that looks like a credential/secret file even
// if it lives inside an otherwise-allowed project directory.
const PROTECTED_BASENAME_PATTERNS = [
  /^\.env(\..+)?$/i,
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /^id_rsa(\.pub)?$/i,
  /^id_ed25519(\.pub)?$/i,
  /^id_ecdsa(\.pub)?$/i,
  /^\.npmrc$/i,
  /^\.netrc$/i,
  /^credentials(\.json)?$/i,
  /^\.aws$/i,
  /^\.git-credentials$/i,
  /^cookies(\.sqlite|\.json)?$/i,
  /^login data$/i,
];

// Any path segment matching these names is denied outright, anywhere in the
// relative path — not just as the final component.
const PROTECTED_SEGMENT_PATTERNS = [/^\.git$/i, /^\.ssh$/i];

function assertNoOptionInjection(rawInput, field) {
  if (typeof rawInput !== "string" || rawInput.length === 0)
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `${field} must be a non-empty string.`,
      { status: 422, details: { field } }
    );
  if (rawInput.startsWith("-"))
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `${field} may not begin with '-'; this would be interpreted as a Git option.`,
      { status: 422, details: { field, value: rawInput } }
    );
  if (rawInput.includes("\0"))
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `${field} may not contain a null byte.`,
      { status: 422, details: { field } }
    );
}

// Windows silently strips trailing dots/spaces from the final path
// component when resolving a file (outside the \\?\ long-path form, which
// nothing here uses), so ".env." and ".env" name the same on-disk file.
// Segments are normalized this way before pattern matching so that
// Win32-only quirk can't be used to spell a protected name differently.
function normalizeSegmentForMatching(segment) {
  return segment.replace(/[. ]+$/, "");
}

function isProtectedRelativePath(relativePath) {
  const segments = relativePath.split(/[\\/]+/).filter(Boolean);
  if (segments.some((segment) => segment === "..")) return true;
  const normalized = segments.map(normalizeSegmentForMatching);
  if (
    normalized.some((segment) =>
      PROTECTED_SEGMENT_PATTERNS.some((p) => p.test(segment))
    )
  )
    return true;
  const basename = normalized[normalized.length - 1] || "";
  return PROTECTED_BASENAME_PATTERNS.some((pattern) => pattern.test(basename));
}

/**
 * Resolves `relativePath` against the repository's canonical root and proves
 * the real (symlink/junction-resolved) location is still inside that root.
 * Throws rather than silently clamping, since a clamp could be surprising to
 * a caller and a throw is the only safe default for a security boundary.
 */
function resolveWithinRoot(canonicalRoot, relativePath, field = "path") {
  assertNoOptionInjection(relativePath, field);
  if (path.isAbsolute(relativePath))
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `${field} must be relative to the repository root.`,
      { status: 422, details: { field } }
    );
  if (isProtectedRelativePath(relativePath))
    throw new YusufOSError(
      ErrorCodes.ACTION_FORBIDDEN,
      `${field} refers to a protected or traversal path.`,
      { status: 403, details: { field, value: relativePath } }
    );

  const naiveResolved = path.resolve(canonicalRoot, relativePath);
  const naiveRelative = path.relative(canonicalRoot, naiveResolved);
  if (naiveRelative.startsWith("..") || path.isAbsolute(naiveRelative))
    throw new YusufOSError(
      ErrorCodes.ACTION_FORBIDDEN,
      `${field} resolves outside the repository root.`,
      { status: 403, details: { field, value: relativePath } }
    );

  // Resolve real (symlink/junction-free) paths for both the root and the
  // target's *existing* ancestor to catch an escape hidden behind a symlink
  // that the naive lexical check above cannot see. If the target itself does
  // not exist yet (a new file about to be staged), walk up to the nearest
  // existing ancestor directory and real-resolve that instead.
  const realRoot = fs.realpathSync.native(canonicalRoot);
  let probe = naiveResolved;
  while (!fs.existsSync(probe)) {
    const parent = path.dirname(probe);
    if (parent === probe) break;
    probe = parent;
  }
  const realProbe = fs.realpathSync.native(probe);
  const realRelative = path.relative(realRoot, realProbe);
  if (
    realRelative.startsWith("..") ||
    (path.isAbsolute(realRelative) && realRelative !== "")
  )
    throw new YusufOSError(
      ErrorCodes.ACTION_FORBIDDEN,
      `${field} escapes the repository root through a symlink or junction.`,
      { status: 403, details: { field, value: relativePath } }
    );

  // A directory pathspec (including "." for the whole tree) would let Git
  // recursively expand it to every file underneath — silently staging any
  // protected file nested inside without that file's own name ever being
  // checked. Staging is defined as an explicit list of individual files.
  if (fs.existsSync(naiveResolved) && fs.statSync(naiveResolved).isDirectory())
    throw new YusufOSError(
      ErrorCodes.ACTION_FORBIDDEN,
      `${field} names a directory; only individual files may be staged.`,
      { status: 403, details: { field, value: relativePath } }
    );

  return {
    relativePath: naiveRelative.split(path.sep).join("/"),
    absolutePath: naiveResolved,
  };
}

/**
 * Validates a batch of caller-supplied staging paths. Returns the normalized
 * (forward-slash, root-relative) paths in the same order. Throws on the
 * first violation rather than silently dropping bad entries.
 */
function assertStagingPathsAllowed(canonicalRoot, relativePaths) {
  if (!Array.isArray(relativePaths) || relativePaths.length === 0)
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      "At least one explicit path is required; staging the whole tree is not a semantic action.",
      { status: 422 }
    );
  if (relativePaths.length > 200)
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      "Too many paths in a single staging request.",
      { status: 422 }
    );
  return relativePaths.map(
    (relativePath, index) =>
      resolveWithinRoot(canonicalRoot, relativePath, `paths[${index}]`)
        .relativePath
  );
}

module.exports = {
  PROTECTED_BASENAME_PATTERNS,
  PROTECTED_SEGMENT_PATTERNS,
  assertNoOptionInjection,
  isProtectedRelativePath,
  resolveWithinRoot,
  assertStagingPathsAllowed,
};
