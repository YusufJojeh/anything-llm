const { randomUUID } = require("crypto");
const prisma = require("../../../../utils/prisma");
const { GovernedAdapter } = require("../../execution/AdapterContract");
const { canonicalHash } = require("../../security/canonicalJson");
const { assertScopeOwnership } = require("./scopeIdentity");

const CAPABILITIES = Object.freeze(["memory.read", "memory.write"]);

function certainFailure(message, details) {
  return Object.assign(new Error(message), {
    effectCertain: true,
    details,
  });
}

function entryDigest({ scope, scopeRef, key, value }) {
  return canonicalHash({ scope, scopeRef, key, value });
}

/**
 * Governed adapter whose "external effect" is a write to Yusuf OS's own
 * database rather than something outside it — see the "New adapter class"
 * section of docs/yusuf-os/gate-b/knowledge-evidence-memory.md for why this
 * still goes through the full boundary rather than being an ungoverned
 * domain-service call like Evidence.
 */
class MemoryAdapter extends GovernedAdapter {
  constructor({ db = prisma } = {}) {
    super();
    this.db = db;
  }

  descriptor() {
    return {
      id: "memory-local",
      kind: "MEMORY_LOCAL",
      capabilities: CAPABILITIES,
    };
  }

  async availability() {
    return { status: "AVAILABLE", account: null };
  }

  async #currentDigest(target) {
    const row = await this.db.yusuf_memory_entries.findUnique({
      where: {
        scope_scopeRef_key: {
          scope: target.scope,
          scopeRef: target.scopeRef,
          key: target.key,
        },
      },
    });
    return row ? row.digest : "ABSENT";
  }

  async preflight(intentSnapshot) {
    const target = JSON.parse(intentSnapshot.canonicalTarget || "{}");
    await assertScopeOwnership(target, intentSnapshot, this.db);
    const resourceVersion = await this.#currentDigest(target);
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
    const target = JSON.parse(intent.canonicalTarget || "{}");
    // Re-checked immediately before execute(), not trusted from preflight —
    // same defense-in-depth pattern as LocalGit/Browser: the framework's
    // generic live-preflight recheck narrows the window, this closes it.
    await assertScopeOwnership(target, intent, this.db);
    return {
      capabilityKey: intent.capabilityKey,
      target,
      payload: JSON.parse(intent.canonicalPayload || "{}"),
      intent,
    };
  }

  async execute(prepared) {
    const { capabilityKey, target, payload } = prepared;
    try {
      switch (capabilityKey) {
        case "memory.read": {
          const row = await this.db.yusuf_memory_entries.findUnique({
            where: {
              scope_scopeRef_key: {
                scope: target.scope,
                scopeRef: target.scopeRef,
                key: target.key,
              },
            },
          });
          return {
            outcome: "SUCCEEDED",
            result: row
              ? {
                  uuid: row.uuid,
                  value: JSON.parse(row.value),
                  updatedAt: row.updatedAt.toISOString(),
                }
              : { uuid: null, value: null, updatedAt: null },
          };
        }
        case "memory.write": {
          if (typeof payload.value === "undefined")
            throw certainFailure("value is required.");
          const digest = entryDigest({ ...target, value: payload.value });
          const principal = {
            createdByPrincipalType: prepared.intent.requestedByPrincipalType,
            createdByPrincipalId: prepared.intent.requestedByPrincipalId,
          };
          const row = await this.db.yusuf_memory_entries.upsert({
            where: {
              scope_scopeRef_key: {
                scope: target.scope,
                scopeRef: target.scopeRef,
                key: target.key,
              },
            },
            create: {
              uuid: randomUUID(),
              scope: target.scope,
              scopeRef: target.scopeRef,
              key: target.key,
              value: JSON.stringify(payload.value),
              digest,
              ...principal,
            },
            update: {
              value: JSON.stringify(payload.value),
              digest,
            },
          });
          return {
            outcome: "SUCCEEDED",
            externalReference: `memory:${target.scope}:${target.scopeRef}:${target.key}`,
            result: { uuid: row.uuid, digest: row.digest },
          };
        }
        default:
          throw certainFailure(
            `Unsupported memory capability: ${capabilityKey}`
          );
      }
    } catch (error) {
      if (error.effectCertain !== undefined) throw error;
      if (
        error.code === "ACTION_FORBIDDEN" ||
        error.code === "VALIDATION_ERROR"
      )
        throw Object.assign(error, { effectCertain: true });
      throw Object.assign(error, { effectCertain: false });
    }
  }

  async verify(intent, executionResult) {
    const target = JSON.parse(intent.canonicalTarget || "{}");
    if (intent.capabilityKey === "memory.read")
      return { status: "VERIFIED", result: {}, evidence: [] };
    const row = await this.db.yusuf_memory_entries.findUnique({
      where: {
        scope_scopeRef_key: {
          scope: target.scope,
          scopeRef: target.scopeRef,
          key: target.key,
        },
      },
    });
    const expected = executionResult?.result?.digest;
    return row && row.digest === expected
      ? {
          status: "VERIFIED",
          result: { digest: row.digest },
          evidence: [{ type: "memory-digest", digest: row.digest }],
        }
      : { status: "NOT_APPLIED", result: {}, evidence: [] };
  }

  async reconcile(intent) {
    if (intent.capabilityKey !== "memory.write")
      return { status: "NOT_APPLIED" };
    const target = JSON.parse(intent.canonicalTarget || "{}");
    const payload = JSON.parse(intent.canonicalPayload || "{}");
    const expected =
      typeof payload.value === "undefined"
        ? null
        : entryDigest({ ...target, value: payload.value });
    const row = await this.db.yusuf_memory_entries.findUnique({
      where: {
        scope_scopeRef_key: {
          scope: target.scope,
          scopeRef: target.scopeRef,
          key: target.key,
        },
      },
    });
    return {
      status:
        expected && row && row.digest === expected ? "VERIFIED" : "NOT_APPLIED",
    };
  }
}

module.exports = { MemoryAdapter, CAPABILITIES, entryDigest };
