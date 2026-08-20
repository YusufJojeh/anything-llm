const prisma = require("../../../../utils/prisma");
const { GovernedAdapter } = require("../../execution/AdapterContract");
const { canonicalHash } = require("../../security/canonicalJson");
const { isValidTransition } = require("../../research/transitions");

const CAPABILITIES = Object.freeze([
  "research.read_items",
  "research.record_item",
  "research.update_status",
]);
const RESOURCE_TYPE = "RESEARCH_ITEM";
const LIST_SCAN_LIMIT = 500;

function certainFailure(message) {
  return Object.assign(new Error(message), { effectCertain: true });
}

function entryDigest({ question, category, status, notes }) {
  return canonicalHash({ question, category, status, notes });
}

function toReadResult(row) {
  return {
    uuid: row.uuid,
    question: row.question,
    category: row.category,
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
 * Governed adapter for Research item tracking — a Prisma-write-as-
 * external-effect adapter, same class as Career/Marketing/Founder/Knowledge/
 * Memory/Monitoring. See docs/yusuf-os/gate-b/research.md.
 */
class ResearchAdapter extends GovernedAdapter {
  constructor({ db = prisma } = {}) {
    super();
    this.db = db;
  }

  descriptor() {
    return {
      id: "research-local",
      kind: "RESEARCH_LOCAL",
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
      const row = await this.db.yusuf_research_items.findUnique({
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
        case "research.read_items": {
          if (target.uuid) {
            const row = await this.db.yusuf_research_items.findUnique({
              where: { uuid: target.uuid },
            });
            return {
              outcome: "SUCCEEDED",
              result: row ? toReadResult(row) : null,
            };
          }
          const rows = await this.db.yusuf_research_items.findMany({
            where: target.status ? { status: target.status } : {},
            take: LIST_SCAN_LIMIT,
            orderBy: { createdAt: "desc" },
          });
          return {
            outcome: "SUCCEEDED",
            result: { items: rows.map(toReadResult) },
          };
        }
        case "research.record_item": {
          if (
            typeof payload.question !== "string" ||
            typeof payload.category !== "string"
          )
            throw certainFailure("question and category are required.");
          const digest = entryDigest(payload);
          const row = await this.db.yusuf_research_items.create({
            data: {
              uuid: target.uuid,
              question: payload.question,
              category: payload.category,
              status: payload.status,
              notes: payload.notes || null,
              createdByPrincipalType: prepared.intent.requestedByPrincipalType,
              createdByPrincipalId: prepared.intent.requestedByPrincipalId,
              digest,
            },
          });
          return {
            outcome: "SUCCEEDED",
            externalReference: `research:${row.uuid}`,
            result: { uuid: row.uuid, status: row.status, digest: row.digest },
          };
        }
        case "research.update_status": {
          const existing = await this.db.yusuf_research_items.findUnique({
            where: { uuid: target.uuid },
          });
          if (!existing)
            throw certainFailure(`Unknown research item: ${target.uuid}`);
          // Re-checked against the current row, not trusted from the request
          // builder's earlier check — same defense-in-depth placement as
          // every prior tracking phase's transition recheck.
          if (!isValidTransition(existing.status, target.status))
            throw certainFailure(
              `Illegal transition: ${existing.status} -> ${target.status}.`
            );
          // Only a real string replaces notes — omitting notes leaves the
          // existing value untouched, same reasoning as Career/Marketing/Founder.
          const notes =
            typeof payload.notes === "string" ? payload.notes : existing.notes;
          const digest = entryDigest({
            question: existing.question,
            category: existing.category,
            status: target.status,
            notes,
          });
          const row = await this.db.yusuf_research_items.update({
            where: { uuid: target.uuid },
            data: { status: target.status, notes, digest },
          });
          return {
            outcome: "SUCCEEDED",
            externalReference: `research:${row.uuid}`,
            result: { uuid: row.uuid, status: row.status, digest: row.digest },
          };
        }
        default:
          throw certainFailure(
            `Unsupported research capability: ${capabilityKey}`
          );
      }
    } catch (error) {
      if (error.effectCertain !== undefined) throw error;
      throw Object.assign(error, { effectCertain: false });
    }
  }

  async verify(intent, executionResult) {
    if (intent.capabilityKey === "research.read_items")
      return { status: "VERIFIED", result: {}, evidence: [] };
    const target = JSON.parse(intent.canonicalTarget || "{}");
    const row = await this.db.yusuf_research_items.findUnique({
      where: { uuid: target.uuid },
    });
    const expected = executionResult?.result?.digest;
    return row && row.digest === expected
      ? {
          status: "VERIFIED",
          result: { digest: row.digest },
          evidence: [{ type: "research-digest", digest: row.digest }],
        }
      : { status: "NOT_APPLIED", result: {}, evidence: [] };
  }

  async reconcile(intent) {
    if (intent.capabilityKey === "research.read_items")
      return { status: "NOT_APPLIED" };
    const target = JSON.parse(intent.canonicalTarget || "{}");
    const row = await this.db.yusuf_research_items.findUnique({
      where: { uuid: target.uuid },
    });
    // Unlike Knowledge/Memory, research.update_status's canonicalPayload
    // carries only `notes`, not the full row — same accepted narrowing as
    // Career/Marketing/Founder's reconcile(). Row existence with the target
    // status applied is the accurate question this reconcile can ask.
    return {
      status: row && row.status === target.status ? "VERIFIED" : "NOT_APPLIED",
    };
  }
}

module.exports = { ResearchAdapter, CAPABILITIES, entryDigest, RESOURCE_TYPE };
