const prisma = require("../../../../utils/prisma");
const { GovernedAdapter } = require("../../execution/AdapterContract");
const { canonicalHash } = require("../../security/canonicalJson");
const { isValidTransition } = require("../../career/transitions");
const { verifiedSubmission } = require("./requestBuilders");

const CAPABILITIES = Object.freeze([
  "career.read_opportunities",
  "career.record_opportunity",
  "career.update_status",
  "career.prepare_application",
  "career.confirm_verified_application",
]);
const RESOURCE_TYPE = "CAREER_OPPORTUNITY";
const LIST_SCAN_LIMIT = 500;

function certainFailure(message) {
  return Object.assign(new Error(message), { effectCertain: true });
}

function entryDigest({
  company,
  role,
  source,
  status,
  notes,
  applicationNotes,
}) {
  return canonicalHash({
    company,
    role,
    source,
    status,
    notes,
    applicationNotes,
  });
}

function toReadResult(row) {
  return {
    uuid: row.uuid,
    company: row.company,
    role: row.role,
    source: row.source,
    status: row.status,
    notes: row.notes,
    applicationNotes: row.applicationNotes,
    createdByPrincipalType: row.createdByPrincipalType,
    createdByPrincipalId: row.createdByPrincipalId,
    digest: row.digest,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Governed adapter for Career opportunity tracking — a Prisma-write-as-
 * external-effect adapter, same class as Knowledge/Memory/Monitoring. See
 * docs/yusuf-os/gate-b/career.md.
 */
class CareerAdapter extends GovernedAdapter {
  constructor({ db = prisma } = {}) {
    super();
    this.db = db;
  }

  descriptor() {
    return {
      id: "career-local",
      kind: "CAREER_LOCAL",
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
      const row = await this.db.yusuf_career_opportunities.findUnique({
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
        case "career.read_opportunities": {
          if (target.uuid) {
            const row = await this.db.yusuf_career_opportunities.findUnique({
              where: { uuid: target.uuid },
            });
            return {
              outcome: "SUCCEEDED",
              result: row ? toReadResult(row) : null,
            };
          }
          const rows = await this.db.yusuf_career_opportunities.findMany({
            where: target.status ? { status: target.status } : {},
            take: LIST_SCAN_LIMIT,
            orderBy: { createdAt: "desc" },
          });
          return {
            outcome: "SUCCEEDED",
            result: { opportunities: rows.map(toReadResult) },
          };
        }
        case "career.record_opportunity": {
          if (
            typeof payload.company !== "string" ||
            typeof payload.role !== "string"
          )
            throw certainFailure("company and role are required.");
          const digest = entryDigest({ ...payload, applicationNotes: null });
          const row = await this.db.yusuf_career_opportunities.create({
            data: {
              uuid: target.uuid,
              company: payload.company,
              role: payload.role,
              source: payload.source || null,
              status: payload.status,
              notes: payload.notes || null,
              applicationNotes: null,
              createdByPrincipalType: prepared.intent.requestedByPrincipalType,
              createdByPrincipalId: prepared.intent.requestedByPrincipalId,
              digest,
            },
          });
          return {
            outcome: "SUCCEEDED",
            externalReference: `career:${row.uuid}`,
            result: { uuid: row.uuid, status: row.status, digest: row.digest },
          };
        }
        case "career.update_status": {
          const existing = await this.db.yusuf_career_opportunities.findUnique({
            where: { uuid: target.uuid },
          });
          if (!existing)
            throw certainFailure(`Unknown career opportunity: ${target.uuid}`);
          // Re-checked against the current row, not trusted from the request
          // builder's earlier check — same defense-in-depth placement as
          // Memory's scope-ownership recheck: the framework's generic
          // live-preflight recheck narrows the window, this closes it.
          if (!isValidTransition(existing.status, target.status))
            throw certainFailure(
              `Illegal transition: ${existing.status} -> ${target.status}.`
            );
          if (target.status === "APPLIED")
            throw certainFailure(
              "APPLIED requires career.confirm_verified_application."
            );
          // Only a real string replaces notes — omitting notes leaves the
          // existing value untouched. There is deliberately no way to clear
          // notes via update_status; recording a fresh opportunity is the
          // path for starting over, same reasoning as the transition table's
          // terminal states.
          const notes =
            typeof payload.notes === "string" ? payload.notes : existing.notes;
          const digest = entryDigest({
            company: existing.company,
            role: existing.role,
            source: existing.source,
            status: target.status,
            notes,
            applicationNotes: existing.applicationNotes,
          });
          const row = await this.db.yusuf_career_opportunities.update({
            where: { uuid: target.uuid },
            data: { status: target.status, notes, digest },
          });
          return {
            outcome: "SUCCEEDED",
            externalReference: `career:${row.uuid}`,
            result: { uuid: row.uuid, status: row.status, digest: row.digest },
          };
        }
        case "career.confirm_verified_application": {
          const existing = await this.db.yusuf_career_opportunities.findUnique({
            where: { uuid: target.uuid },
          });
          if (!existing)
            throw certainFailure(`Unknown career opportunity: ${target.uuid}`);
          if (!isValidTransition(existing.status, "APPLIED"))
            throw certainFailure(
              `Illegal transition: ${existing.status} -> APPLIED.`
            );
          const submission = await verifiedSubmission(
            {
              uuid: target.uuid,
              submissionIntentUuid: payload.submissionIntentUuid,
            },
            this.db
          );
          if (submission.taskId !== prepared.intent.taskId)
            throw certainFailure(
              "The verified submission and Career confirmation must belong to the same task."
            );
          const notes =
            existing.notes ||
            "Application confirmed by verified browser submission.";
          const digest = entryDigest({ ...existing, status: "APPLIED", notes });
          const row = await this.db.yusuf_career_opportunities.update({
            where: { uuid: target.uuid },
            data: { status: "APPLIED", notes, digest },
          });
          return {
            outcome: "SUCCEEDED",
            externalReference: `career:${row.uuid}`,
            result: { uuid: row.uuid, status: row.status, digest: row.digest },
          };
        }
        case "career.prepare_application": {
          const existing = await this.db.yusuf_career_opportunities.findUnique({
            where: { uuid: target.uuid },
          });
          if (!existing)
            throw certainFailure(`Unknown career opportunity: ${target.uuid}`);
          // Re-checked against the current row — never trusted from the
          // request builder's earlier check, same defense-in-depth placement
          // as every other governed write in this domain.
          if (existing.status !== "RESEARCHING")
            throw certainFailure(
              `An application can only be drafted while an opportunity is still RESEARCHING (current status: ${existing.status}).`
            );
          const digest = entryDigest({
            company: existing.company,
            role: existing.role,
            source: existing.source,
            status: existing.status,
            notes: existing.notes,
            applicationNotes: payload.applicationNotes,
          });
          const row = await this.db.yusuf_career_opportunities.update({
            where: { uuid: target.uuid },
            data: { applicationNotes: payload.applicationNotes, digest },
          });
          return {
            outcome: "SUCCEEDED",
            externalReference: `career:${row.uuid}`,
            result: { uuid: row.uuid, status: row.status, digest: row.digest },
          };
        }
        default:
          throw certainFailure(
            `Unsupported career capability: ${capabilityKey}`
          );
      }
    } catch (error) {
      if (error.effectCertain !== undefined) throw error;
      throw Object.assign(error, { effectCertain: false });
    }
  }

  async verify(intent, executionResult) {
    if (intent.capabilityKey === "career.read_opportunities")
      return { status: "VERIFIED", result: {}, evidence: [] };
    const target = JSON.parse(intent.canonicalTarget || "{}");
    const row = await this.db.yusuf_career_opportunities.findUnique({
      where: { uuid: target.uuid },
    });
    const expected = executionResult?.result?.digest;
    return row && row.digest === expected
      ? {
          status: "VERIFIED",
          result: { digest: row.digest },
          evidence: [{ type: "career-digest", digest: row.digest }],
        }
      : { status: "NOT_APPLIED", result: {}, evidence: [] };
  }

  async reconcile(intent) {
    if (intent.capabilityKey === "career.read_opportunities")
      return { status: "NOT_APPLIED" };
    const target = JSON.parse(intent.canonicalTarget || "{}");
    const row = await this.db.yusuf_career_opportunities.findUnique({
      where: { uuid: target.uuid },
    });
    // Unlike Knowledge/Memory, career.update_status's canonicalPayload carries
    // only `notes`, not the full row — recomputing an "expected" digest here
    // would require re-deriving fields the intent never recorded. Row
    // existence with the target status applied is therefore the accurate
    // question this reconcile can ask.
    return {
      status: row && row.status === target.status ? "VERIFIED" : "NOT_APPLIED",
    };
  }
}

module.exports = { CareerAdapter, CAPABILITIES, entryDigest, RESOURCE_TYPE };
