const prisma = require("../../../../utils/prisma");
const { GovernedAdapter } = require("../../execution/AdapterContract");
const { canonicalHash } = require("../../security/canonicalJson");
const { isValidTransition } = require("../../marketing/transitions");

const CAPABILITIES = Object.freeze([
  "marketing.read_content",
  "marketing.record_content",
  "marketing.update_status",
]);
const RESOURCE_TYPE = "MARKETING_CONTENT";
const LIST_SCAN_LIMIT = 500;

function certainFailure(message) {
  return Object.assign(new Error(message), { effectCertain: true });
}

function entryDigest({ title, channel, format, status, notes }) {
  return canonicalHash({ title, channel, format, status, notes });
}

function toReadResult(row) {
  return {
    uuid: row.uuid,
    title: row.title,
    channel: row.channel,
    format: row.format,
    status: row.status,
    notes: row.notes,
    createdByPrincipalType: row.createdByPrincipalType,
    createdByPrincipalId: row.createdByPrincipalId,
    digest: row.digest,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Governed adapter for Marketing content tracking — a Prisma-write-as-
 * external-effect adapter, same class as Career/Knowledge/Memory/Monitoring.
 * See docs/yusuf-os/gate-b/marketing.md.
 */
class MarketingAdapter extends GovernedAdapter {
  constructor({ db = prisma } = {}) {
    super();
    this.db = db;
  }

  descriptor() {
    return {
      id: "marketing-local",
      kind: "MARKETING_LOCAL",
      capabilities: CAPABILITIES,
    };
  }

  async availability() {
    return { status: "AVAILABLE", account: null };
  }

  async preflight(intentSnapshot) {
    const target = JSON.parse(intentSnapshot.canonicalTarget || "{}");
    let resourceVersion = "N/A";
    if (target.uuid) {
      const row = await this.db.yusuf_marketing_content.findUnique({
        where: { uuid: target.uuid },
      });
      resourceVersion = row ? row.digest : "ABSENT";
    }
    return {
      accountIdentity: null,
      resourceVersion,
      targetIdentityDigest: canonicalHash({
        resource: {
          type: intentSnapshot.resourceType,
          id: intentSnapshot.resourceId,
        },
        target,
      }),
    };
  }

  async prepare(intent) {
    return {
      capabilityKey: intent.capabilityKey,
      target: JSON.parse(intent.canonicalTarget || "{}"),
      payload: JSON.parse(intent.canonicalPayload || "{}"),
      intent,
    };
  }

  async execute(prepared) {
    const { capabilityKey, target, payload } = prepared;
    try {
      switch (capabilityKey) {
        case "marketing.read_content": {
          if (target.uuid) {
            const row = await this.db.yusuf_marketing_content.findUnique({
              where: { uuid: target.uuid },
            });
            return {
              outcome: "SUCCEEDED",
              result: row ? toReadResult(row) : null,
            };
          }
          const rows = await this.db.yusuf_marketing_content.findMany({
            where: target.status ? { status: target.status } : {},
            take: LIST_SCAN_LIMIT,
            orderBy: { createdAt: "desc" },
          });
          return {
            outcome: "SUCCEEDED",
            result: { items: rows.map(toReadResult) },
          };
        }
        case "marketing.record_content": {
          if (
            typeof payload.title !== "string" ||
            typeof payload.channel !== "string" ||
            typeof payload.format !== "string"
          )
            throw certainFailure("title, channel, and format are required.");
          const digest = entryDigest(payload);
          const row = await this.db.yusuf_marketing_content.create({
            data: {
              uuid: target.uuid,
              title: payload.title,
              channel: payload.channel,
              format: payload.format,
              status: payload.status,
              notes: payload.notes || null,
              createdByPrincipalType: prepared.intent.requestedByPrincipalType,
              createdByPrincipalId: prepared.intent.requestedByPrincipalId,
              digest,
            },
          });
          return {
            outcome: "SUCCEEDED",
            externalReference: `marketing:${row.uuid}`,
            result: { uuid: row.uuid, status: row.status, digest: row.digest },
          };
        }
        case "marketing.update_status": {
          const existing = await this.db.yusuf_marketing_content.findUnique({
            where: { uuid: target.uuid },
          });
          if (!existing)
            throw certainFailure(
              `Unknown marketing content item: ${target.uuid}`
            );
          // Re-checked against the current row, not trusted from the request
          // builder's earlier check — same defense-in-depth placement as
          // Career's transition recheck / Memory's scope-ownership recheck.
          if (!isValidTransition(existing.status, target.status))
            throw certainFailure(
              `Illegal transition: ${existing.status} -> ${target.status}.`
            );
          // Only a real string replaces notes — omitting notes leaves the
          // existing value untouched, same reasoning as CareerAdapter.
          const notes =
            typeof payload.notes === "string" ? payload.notes : existing.notes;
          const digest = entryDigest({
            title: existing.title,
            channel: existing.channel,
            format: existing.format,
            status: target.status,
            notes,
          });
          const row = await this.db.yusuf_marketing_content.update({
            where: { uuid: target.uuid },
            data: { status: target.status, notes, digest },
          });
          return {
            outcome: "SUCCEEDED",
            externalReference: `marketing:${row.uuid}`,
            result: { uuid: row.uuid, status: row.status, digest: row.digest },
          };
        }
        default:
          throw certainFailure(
            `Unsupported marketing capability: ${capabilityKey}`
          );
      }
    } catch (error) {
      if (error.effectCertain !== undefined) throw error;
      throw Object.assign(error, { effectCertain: false });
    }
  }

  async verify(intent, executionResult) {
    if (intent.capabilityKey === "marketing.read_content")
      return { status: "VERIFIED", result: {}, evidence: [] };
    const target = JSON.parse(intent.canonicalTarget || "{}");
    const row = await this.db.yusuf_marketing_content.findUnique({
      where: { uuid: target.uuid },
    });
    const expected = executionResult?.result?.digest;
    return row && row.digest === expected
      ? {
          status: "VERIFIED",
          result: { digest: row.digest },
          evidence: [{ type: "marketing-digest", digest: row.digest }],
        }
      : { status: "NOT_APPLIED", result: {}, evidence: [] };
  }

  async reconcile(intent) {
    if (intent.capabilityKey === "marketing.read_content")
      return { status: "NOT_APPLIED" };
    const target = JSON.parse(intent.canonicalTarget || "{}");
    const row = await this.db.yusuf_marketing_content.findUnique({
      where: { uuid: target.uuid },
    });
    // Unlike Knowledge/Memory, marketing.update_status's canonicalPayload
    // carries only `notes`, not the full row — same accepted narrowing as
    // Career's reconcile(). Row existence with the target status applied is
    // the accurate question this reconcile can ask.
    return {
      status: row && row.status === target.status ? "VERIFIED" : "NOT_APPLIED",
    };
  }
}

module.exports = { MarketingAdapter, CAPABILITIES, entryDigest, RESOURCE_TYPE };
