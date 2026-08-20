const prisma = require("../../../../utils/prisma");
const {
  INTENT_STATUSES,
  APPROVAL_STATUSES,
  SECURITY_SETTING_KEYS,
} = require("../../constants");
const { auditKeyConfigured } = require("../../audit/AuditService");

/**
 * Reads the raw signals `monitoring/thresholds.js` judges. Deliberately
 * separate from `DashboardProjection` (Gate F): that projection also probes
 * adapter availability, which can fork a subprocess (`git --version`) — not
 * something a governed capability's `execute()` should risk doing on every
 * call. This reads Prisma only.
 */
async function readSystemHealthSnapshot(db = prisma, { excludeIntentId } = {}) {
  const [pendingApprovals, unresolvedIntents, killSwitch] = await Promise.all([
    db.yusuf_approval_requests.count({
      where: { status: APPROVAL_STATUSES.PENDING },
    }),
    db.yusuf_action_intents.count({
      where: {
        status: {
          in: [
            INTENT_STATUSES.EXECUTING,
            INTENT_STATUSES.EXECUTED_UNVERIFIED,
            INTENT_STATUSES.FAILED_UNKNOWN,
          ],
        },
        // `system.read_health` never persists anything — no real effect can
        // ever be left unresolved under it, so the whole capability is safe
        // to exclude outright. `monitoring.record_check` is a real write
        // (see MonitoringAdapter) and CAN legitimately get stuck
        // EXECUTING/FAILED_UNKNOWN; it must keep counting normally. The only
        // intent that is safe (and necessary) to exclude here is the one
        // computing *this* snapshot, whose framework-assigned EXECUTING
        // status would otherwise make every check see itself as unresolved —
        // excluded by exact id, not by capability class, so a genuinely
        // stuck monitoring.record_check from a *previous* call stays visible.
        capabilityKey: { not: "system.read_health" },
        ...(excludeIntentId ? { id: { not: Number(excludeIntentId) } } : {}),
      },
    }),
    db.yusuf_security_settings.findUnique({
      where: { key: SECURITY_SETTING_KEYS.EXTERNAL_MUTATIONS_DISABLED },
    }),
  ]);
  return {
    pendingApprovals,
    unresolvedIntents,
    controlPlaneHealthy: auditKeyConfigured(),
    killSwitchEngaged: killSwitch?.value === "true",
    capturedAt: new Date().toISOString(),
  };
}

module.exports = { readSystemHealthSnapshot };
