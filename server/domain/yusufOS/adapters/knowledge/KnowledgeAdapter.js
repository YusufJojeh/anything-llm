const prisma = require("../../../../utils/prisma");
const { GovernedAdapter } = require("../../execution/AdapterContract");
const { canonicalHash } = require("../../security/canonicalJson");

const CAPABILITIES = Object.freeze(["knowledge.read", "knowledge.write"]);
const RESOURCE_TYPE = "KNOWLEDGE_ENTRY";
const LIST_SCAN_LIMIT = 500;

function certainFailure(message) {
  return Object.assign(new Error(message), { effectCertain: true });
}

function entryDigest({ title, body, sourceType, sourceRef, tags }) {
  return canonicalHash({ title, body, sourceType, sourceRef, tags });
}

// Trims the Prisma row to a stable, JSON-serializable shape — `createdAt`/
// `updatedAt` are Date instances that `redactForPersistence` would otherwise
// flatten to `{}` (it only knows strings/plain-object/array shapes), so they
// are surfaced as ISO strings explicitly rather than passed through raw.
function toReadResult(row) {
  return {
    uuid: row.uuid,
    title: row.title,
    body: row.body,
    sourceType: row.sourceType,
    sourceRef: row.sourceRef,
    tags: JSON.parse(row.tags || "[]"),
    createdByPrincipalType: row.createdByPrincipalType,
    createdByPrincipalId: row.createdByPrincipalId,
    digest: row.digest,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Governed adapter for the Knowledge store — a Prisma-write-as-external-
 * effect adapter, same class as MemoryAdapter. See "New adapter class" in
 * docs/yusuf-os/gate-b/knowledge-evidence-memory.md.
 */
class KnowledgeAdapter extends GovernedAdapter {
  constructor({ db = prisma } = {}) {
    super();
    this.db = db;
  }

  descriptor() {
    return {
      id: "knowledge-local",
      kind: "KNOWLEDGE_LOCAL",
      capabilities: CAPABILITIES,
    };
  }

  async availability() {
    return { status: "AVAILABLE", account: null };
  }

  async preflight(intentSnapshot) {
    const target = JSON.parse(intentSnapshot.canonicalTarget || "{}");
    let resourceVersion = "ABSENT";
    if (target.uuid) {
      const row = await this.db.yusuf_knowledge_entries.findUnique({
        where: { uuid: target.uuid },
      });
      resourceVersion = row ? row.digest : "ABSENT";
    } else {
      resourceVersion = "N/A";
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
        case "knowledge.read": {
          if (target.uuid) {
            const row = await this.db.yusuf_knowledge_entries.findUnique({
              where: { uuid: target.uuid },
            });
            return {
              outcome: "SUCCEEDED",
              result: row ? toReadResult(row) : null,
            };
          }
          const rows = await this.db.yusuf_knowledge_entries.findMany({
            take: LIST_SCAN_LIMIT,
            orderBy: { createdAt: "desc" },
          });
          const matches = rows
            .map(toReadResult)
            .filter((row) => row.tags.includes(target.tag));
          return { outcome: "SUCCEEDED", result: { entries: matches } };
        }
        case "knowledge.write": {
          if (
            typeof payload.title !== "string" ||
            typeof payload.body !== "string"
          )
            throw certainFailure("title and body are required.");
          const digest = entryDigest(payload);
          const row = await this.db.yusuf_knowledge_entries.create({
            data: {
              uuid: target.uuid,
              title: payload.title,
              body: payload.body,
              sourceType: payload.sourceType,
              sourceRef: payload.sourceRef || null,
              tags: JSON.stringify(payload.tags || []),
              createdByPrincipalType: prepared.intent.requestedByPrincipalType,
              createdByPrincipalId: prepared.intent.requestedByPrincipalId,
              digest,
            },
          });
          return {
            outcome: "SUCCEEDED",
            externalReference: `knowledge:${row.uuid}`,
            result: { uuid: row.uuid, digest: row.digest },
          };
        }
        default:
          throw certainFailure(
            `Unsupported knowledge capability: ${capabilityKey}`
          );
      }
    } catch (error) {
      if (error.effectCertain !== undefined) throw error;
      throw Object.assign(error, { effectCertain: false });
    }
  }

  async verify(intent, executionResult) {
    if (intent.capabilityKey === "knowledge.read")
      return { status: "VERIFIED", result: {}, evidence: [] };
    const target = JSON.parse(intent.canonicalTarget || "{}");
    const row = await this.db.yusuf_knowledge_entries.findUnique({
      where: { uuid: target.uuid },
    });
    const expected = executionResult?.result?.digest;
    return row && row.digest === expected
      ? {
          status: "VERIFIED",
          result: { digest: row.digest },
          evidence: [{ type: "knowledge-digest", digest: row.digest }],
        }
      : { status: "NOT_APPLIED", result: {}, evidence: [] };
  }

  async reconcile(intent) {
    if (intent.capabilityKey !== "knowledge.write")
      return { status: "NOT_APPLIED" };
    const target = JSON.parse(intent.canonicalTarget || "{}");
    const payload = JSON.parse(intent.canonicalPayload || "{}");
    const row = await this.db.yusuf_knowledge_entries.findUnique({
      where: { uuid: target.uuid },
    });
    const expected = row ? entryDigest(payload) : null;
    return {
      status:
        row && expected && row.digest === expected ? "VERIFIED" : "NOT_APPLIED",
    };
  }
}

module.exports = { KnowledgeAdapter, CAPABILITIES, entryDigest, RESOURCE_TYPE };
