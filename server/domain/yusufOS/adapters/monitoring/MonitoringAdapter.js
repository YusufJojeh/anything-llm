const prisma = require("../../../../utils/prisma");
const { GovernedAdapter } = require("../../execution/AdapterContract");
const { canonicalHash } = require("../../security/canonicalJson");
const { readSystemHealthSnapshot } = require("../systemHealth/snapshot");
const { evaluateCheck } = require("../../monitoring/thresholds");

const CAPABILITIES = Object.freeze(["monitoring.record_check"]);

function certainFailure(message) {
  return Object.assign(new Error(message), { effectCertain: true });
}

function entryDigest({ checkKey, status, observedValue, threshold, summary }) {
  return canonicalHash({ checkKey, status, observedValue, threshold, summary });
}

/**
 * Governed adapter for the Monitoring check history — a Prisma-write-as-
 * external-effect adapter, same class as Knowledge/Memory (Phase J). The one
 * difference from those: the payload the row is built from is never trusted
 * from the model. `execute()` recomputes the health snapshot itself and
 * derives `status`/`observedValue`/`threshold`/`summary` from code-owned
 * thresholds — a model supplying `checkKey` cannot cause any other verdict to
 * be recorded. See docs/yusuf-os/gate-b/monitoring.md.
 */
class MonitoringAdapter extends GovernedAdapter {
  constructor({ db = prisma } = {}) {
    super();
    this.db = db;
  }

  descriptor() {
    return {
      id: "monitoring-local",
      kind: "MONITORING_LOCAL",
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
    return {
      capabilityKey: intent.capabilityKey,
      target: JSON.parse(intent.canonicalTarget || "{}"),
      intent,
    };
  }

  async execute(prepared) {
    const { capabilityKey, target } = prepared;
    try {
      switch (capabilityKey) {
        case "monitoring.record_check": {
          if (!target.checkKey) throw certainFailure("checkKey is required.");
          const snapshot = await readSystemHealthSnapshot(this.db, {
            excludeIntentId: prepared.intent.id,
          });
          let verdict;
          try {
            verdict = evaluateCheck(target.checkKey, snapshot);
          } catch (error) {
            throw certainFailure(error.message);
          }
          const observedValue = snapshot;
          const digest = entryDigest({
            checkKey: target.checkKey,
            status: verdict.status,
            observedValue,
            threshold: verdict.threshold,
            summary: verdict.summary,
          });
          const row = await this.db.yusuf_monitoring_checks.create({
            data: {
              uuid: target.uuid,
              checkKey: target.checkKey,
              status: verdict.status,
              observedValue: JSON.stringify(observedValue),
              threshold: JSON.stringify(verdict.threshold),
              summary: verdict.summary,
              createdByPrincipalType: prepared.intent.requestedByPrincipalType,
              createdByPrincipalId: prepared.intent.requestedByPrincipalId,
              digest,
            },
          });
          return {
            outcome: "SUCCEEDED",
            externalReference: `monitoring:${row.uuid}`,
            result: {
              uuid: row.uuid,
              status: row.status,
              summary: row.summary,
              digest: row.digest,
            },
          };
        }
        default:
          throw certainFailure(
            `Unsupported monitoring capability: ${capabilityKey}`
          );
      }
    } catch (error) {
      if (error.effectCertain !== undefined) throw error;
      throw Object.assign(error, { effectCertain: false });
    }
  }

  async verify(intent, executionResult) {
    const target = JSON.parse(intent.canonicalTarget || "{}");
    const row = await this.db.yusuf_monitoring_checks.findUnique({
      where: { uuid: target.uuid },
    });
    const expected = executionResult?.result?.digest;
    return row && row.digest === expected
      ? {
          status: "VERIFIED",
          result: { digest: row.digest },
          evidence: [{ type: "monitoring-check-digest", digest: row.digest }],
        }
      : { status: "NOT_APPLIED", result: {}, evidence: [] };
  }

  // Unlike Knowledge/Memory, the intent's own canonicalPayload carries no
  // content to recompute an expected digest from — the verdict is derived
  // from a live snapshot at execute time, not from anything the intent
  // recorded up front. Row existence for this uuid is therefore the whole
  // question: the row's own digest is self-consistent by construction
  // (computed from the exact fields written alongside it in the same call).
  async reconcile(intent) {
    const target = JSON.parse(intent.canonicalTarget || "{}");
    const row = await this.db.yusuf_monitoring_checks.findUnique({
      where: { uuid: target.uuid },
    });
    return { status: row ? "VERIFIED" : "NOT_APPLIED" };
  }
}

module.exports = { MonitoringAdapter, CAPABILITIES, entryDigest };
