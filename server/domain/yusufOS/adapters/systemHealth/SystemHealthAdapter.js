const prisma = require("../../../../utils/prisma");
const { GovernedAdapter } = require("../../execution/AdapterContract");
const { canonicalHash } = require("../../security/canonicalJson");
const { readSystemHealthSnapshot } = require("./snapshot");

const CAPABILITIES = Object.freeze(["system.read_health"]);

/**
 * Read-only adapter over Yusuf OS's own internal state. No target, no
 * payload, no external effect — see docs/yusuf-os/gate-b/monitoring.md.
 */
class SystemHealthAdapter extends GovernedAdapter {
  constructor({ db = prisma } = {}) {
    super();
    this.db = db;
  }

  descriptor() {
    return {
      id: "system-health-local",
      kind: "SYSTEM_HEALTH_LOCAL",
      capabilities: CAPABILITIES,
    };
  }

  async availability() {
    return { status: "AVAILABLE", account: null };
  }

  async preflight(intentSnapshot) {
    return {
      accountIdentity: null,
      resourceVersion: "N/A",
      targetIdentityDigest: canonicalHash({
        resource: {
          type: intentSnapshot.resourceType,
          id: intentSnapshot.resourceId,
        },
      }),
    };
  }

  async prepare(intent) {
    return { capabilityKey: intent.capabilityKey, intent };
  }

  async execute(prepared) {
    if (prepared.capabilityKey !== "system.read_health")
      throw Object.assign(
        new Error(`Unsupported system capability: ${prepared.capabilityKey}`),
        { effectCertain: true }
      );
    const snapshot = await readSystemHealthSnapshot(this.db, {
      excludeIntentId: prepared.intent.id,
    });
    return { outcome: "SUCCEEDED", result: snapshot };
  }

  async verify() {
    return { status: "VERIFIED", result: {}, evidence: [] };
  }

  async reconcile() {
    return { status: "VERIFIED" };
  }
}

module.exports = { SystemHealthAdapter, CAPABILITIES };
