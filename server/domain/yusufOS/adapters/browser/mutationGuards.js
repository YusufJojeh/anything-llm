const { YusufOSError, ErrorCodes } = require("../../errors/YusufOSError");
const { sha256 } = require("../../security/canonicalJson");

/**
 * The checks that stand between an approved browser mutation and the click that performs it.
 *
 * Approval in Yusuf OS binds a *situation*, not just an action: which account, which origin, which
 * page, which payload. Between the moment Yusuf approves and the moment the broker acts, any of
 * those can change — the operator switches Google account, the page re-renders with a different
 * recipient, a redirect lands somewhere else. Every one of those must refuse the mutation rather
 * than proceed on a changed world.
 *
 * These guards are deliberately separate from the adapter so they can be reasoned about and tested
 * on their own, and so a future adapter (a real Gmail API, say) reuses the same semantics rather
 * than reimplementing them more loosely.
 */

function forbidden(message, details = {}) {
  return new YusufOSError(ErrorCodes.ACTION_FORBIDDEN, message, {
    status: 403,
    details,
  });
}

/**
 * Stable digest of an account identity, for binding into an approval.
 *
 * Only session-verified identities produce a digest. An identity a page merely *claimed* has no
 * digest at all, which means it can never match a bound constraint — a hostile page cannot talk its
 * way into satisfying an account check by printing the right name.
 */
function accountIdentityDigest(identity) {
  if (!identity || identity.verifiedBySession !== true) return null;
  if (identity.state !== "authenticated") return null;
  // Cookie existence alone proves only that *some* session exists. A mutation
  // must bind a concrete, independently derived account label; the generic CDP
  // driver intentionally cannot invent one from hostile page text.
  if (
    typeof identity.accountLabel !== "string" ||
    identity.accountLabel.trim().length === 0
  )
    return null;
  return sha256(
    JSON.stringify({
      origin: String(identity.origin || ""),
      accountLabel: String(identity.accountLabel || ""),
    })
  );
}

/**
 * Refuses the mutation unless the account at execution time is the one the approval bound.
 *
 * Wrong-account protection is the single most consequential check here: sending a reply from the
 * wrong Gmail, posting from the wrong LinkedIn, or pushing as the wrong GitHub user are all
 * irreversible and all indistinguishable from correct behaviour if we do not check.
 */
function assertAccountMatches(boundDigest, currentIdentity) {
  const currentDigest = accountIdentityDigest(currentIdentity);

  if (!currentDigest)
    throw forbidden(
      "The active account could not be verified from the browser session.",
      {
        reason: "ACCOUNT_UNVERIFIED",
        // Deliberately not echoing the claimed label: it is attacker-controlled.
        state: currentIdentity?.state || "unknown",
      }
    );

  // No bound constraint is not a licence to proceed. An external mutation whose
  // approval never pinned an account is an approval that did not describe the
  // action, so it fails closed like any other unknown identity.
  if (!boundDigest)
    throw forbidden("This approval did not bind an account identity.", {
      reason: "ACCOUNT_NOT_BOUND",
    });

  if (boundDigest !== currentDigest)
    throw forbidden(
      "The active browser account is not the account this action was approved for.",
      { reason: "ACCOUNT_MISMATCH" }
    );

  return true;
}

/**
 * Refuses the mutation if the page changed after it was approved.
 *
 * Yusuf approved a specific rendered page — this recipient, this amount, this job posting. If the
 * DOM changed at all, what he approved is no longer what would be submitted.
 */
function assertPageUnchanged(approvedDigest, currentDigest) {
  if (!approvedDigest)
    throw forbidden("This approval did not bind a page state.", {
      reason: "PAGE_NOT_BOUND",
    });
  if (!currentDigest)
    throw forbidden("The current page state could not be established.", {
      reason: "PAGE_UNREADABLE",
    });
  if (approvedDigest !== currentDigest)
    throw forbidden(
      "The page changed after this action was approved. Re-read and re-approve it.",
      { reason: "PAGE_CHANGED" }
    );
  return true;
}

/**
 * Classifies an adapter failure into a certain failure or an unknown outcome.
 *
 * This is the rule that keeps a browser mutation from being retried blindly. A click that timed
 * out, a navigation that never resolved, or a connection that dropped mid-submit may all have
 * *succeeded* on the server. Treating those as clean failures is how a system sends the same email
 * twice.
 *
 * `effectCertain: true` means we know nothing happened (a guard refused before acting).
 * Anything else is `FAILED_UNKNOWN` and must go to reconciliation, never to retry.
 */
function classifyFailure(error) {
  const certain = error?.effectCertain === true;
  return {
    effectCertain: certain,
    outcome: certain ? "FAILED" : "UNKNOWN",
    reason: certain ? "REFUSED_BEFORE_EFFECT" : "OUTCOME_UNKNOWN",
  };
}

/** Marks an error as having definitely not caused an external effect. */
function certainFailure(message, details = {}) {
  const error = forbidden(message, details);
  error.effectCertain = true;
  return error;
}

/** Marks an error whose external effect is genuinely unknown. */
function uncertainFailure(message, details = {}) {
  const error = new YusufOSError(ErrorCodes.EXECUTION_UNKNOWN, message, {
    status: 500,
    details,
  });
  error.effectCertain = false;
  return error;
}

module.exports = {
  accountIdentityDigest,
  assertAccountMatches,
  assertPageUnchanged,
  classifyFailure,
  certainFailure,
  uncertainFailure,
};
