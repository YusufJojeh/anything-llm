const path = require("path");
const fs = require("fs");
const { YusufOSError, ErrorCodes } = require("../../errors/YusufOSError");

// user:password@ or user@ with a password segment embedded in a URL-style
// remote. Bare `user@host` (no colon-password) is normal (e.g. git@github.com)
// and is not itself a secret, so only the colon-password form is rejected.
const EMBEDDED_CREDENTIAL_PATTERN = /:\/\/[^/@]*:[^/@]*@/;

function assertNoEmbeddedCredentials(remoteUrl) {
  if (EMBEDDED_CREDENTIAL_PATTERN.test(remoteUrl))
    throw new YusufOSError(
      ErrorCodes.ACTION_FORBIDDEN,
      "A remote URL with embedded credentials is never used by a governed operation.",
      { status: 403 }
    );
}

/**
 * Produces a stable, credential-free fingerprint for a remote so it can be
 * bound into an approval's account-identity digest. Local filesystem remotes
 * (the only remote kind Gate D actually drives) are identified by their real,
 * symlink-resolved path so a swapped directory is detected as a different
 * account. Anything else is treated as a URL and reduced to scheme+host+path.
 */
function canonicalRemoteFingerprint(remoteUrl) {
  assertNoEmbeddedCredentials(remoteUrl);
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(remoteUrl)) {
    if (remoteUrl.startsWith("file://")) {
      const filePath = remoteUrl.replace(/^file:\/\//, "");
      return canonicalLocalFingerprint(filePath);
    }
    const parsed = new URL(remoteUrl);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`.toLowerCase();
  }
  // SCP-like syntax: user@host:path
  const scpMatch = /^[^@\s]+@([^:\s]+):(.+)$/.exec(remoteUrl);
  if (scpMatch) return `ssh://${scpMatch[1]}/${scpMatch[2]}`.toLowerCase();
  // Otherwise treat as a local filesystem path (what the disposable Gate D
  // fixture, and any locally-registered bare remote, actually uses).
  return canonicalLocalFingerprint(remoteUrl);
}

function canonicalLocalFingerprint(filePath) {
  const resolved = path.resolve(filePath);
  try {
    return `local://${fs.realpathSync.native(resolved)}`;
  } catch {
    // The path may not exist yet (e.g. availability-check before the bare
    // remote is created) — fall back to the lexically resolved path so a
    // fingerprint can still be computed; existence is verified separately.
    return `local://${resolved}`;
  }
}

module.exports = {
  EMBEDDED_CREDENTIAL_PATTERN,
  assertNoEmbeddedCredentials,
  canonicalRemoteFingerprint,
  canonicalLocalFingerprint,
};
