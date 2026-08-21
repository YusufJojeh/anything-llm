const prisma = require("../../../../utils/prisma");
const { GovernedAdapter } = require("../../execution/AdapterContract");
const { canonicalHash } = require("../../security/canonicalJson");
const { redactForPersistence } = require("../../security/redaction");
const { isValidTransition } = require("../../inbox/transitions");
const {
  isValidTransition: isValidCareerTransition,
} = require("../../career/transitions");
const { entryDigest: careerEntryDigest } = require("../career/CareerAdapter");

const CAPABILITIES = Object.freeze([
  "inbox.list_messages",
  "inbox.read_message",
  "inbox.record_message",
  "inbox.classify_message",
  "inbox.prepare_reply",
  "inbox.archive_local",
  "inbox.advance_linked_career_status",
]);
const RESOURCE_TYPE = "INBOX_MESSAGE";
const CAREER_ADVANCING_CLASSIFICATIONS = Object.freeze([
  "INTERVIEW",
  "REJECTION",
]);
const LIST_SCAN_LIMIT = 500;

function certainFailure(message) {
  return Object.assign(new Error(message), { effectCertain: true });
}

// Email content (sender/subject/snippet/draft) is external, attacker-
// influenceable text, never Yusuf's own assertion — redacted for persistence
// like every other governed write, same as the Browser Broker's page content.
function entryDigest({
  sender,
  subject,
  snippet,
  classification,
  status,
  draftReplyBody,
  linkedCareerOpportunityUuid,
}) {
  return canonicalHash(
    redactForPersistence({
      sender,
      subject,
      snippet,
      classification,
      status,
      draftReplyBody,
      linkedCareerOpportunityUuid,
    })
  );
}

function toReadResult(row) {
  return {
    uuid: row.uuid,
    sender: row.sender,
    subject: row.subject,
    snippet: row.snippet,
    classification: row.classification,
    status: row.status,
    draftReplyBody: row.draftReplyBody,
    linkedCareerOpportunityUuid: row.linkedCareerOpportunityUuid,
    createdByPrincipalType: row.createdByPrincipalType,
    createdByPrincipalId: row.createdByPrincipalId,
    digest: row.digest,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Governed adapter for Inbox message tracking — a Prisma-write-as-external-
 * effect adapter, same class as Career/Marketing/Founder/Research. See
 * docs/yusuf-os/gate-b/sales-inbox.md. Deliberately has no send/reply/archive
 * capability against a real provider — every capability here is local-only.
 */
class InboxAdapter extends GovernedAdapter {
  constructor({ db = prisma } = {}) {
    super();
    this.db = db;
  }

  descriptor() {
    return {
      id: "inbox-local",
      kind: "INBOX_LOCAL",
      capabilities: CAPABILITIES,
    };
  }

  async availability() {
    return { status: "AVAILABLE", account: null };
  }

  async preflight(intentSnapshot) {
    const target = JSON.parse(intentSnapshot.canonicalTarget || "{}");
    let resourceVersion = "N/A";
    if (intentSnapshot.capabilityKey === "inbox.advance_linked_career_status") {
      if (target.uuid) {
        const row = await this.db.yusuf_career_opportunities.findUnique({
          where: { uuid: target.uuid },
        });
        resourceVersion = row ? row.digest : "ABSENT";
      }
    } else if (target.uuid) {
      const row = await this.db.yusuf_inbox_messages.findUnique({
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
        case "inbox.list_messages":
        case "inbox.read_message": {
          if (target.uuid) {
            const row = await this.db.yusuf_inbox_messages.findUnique({
              where: { uuid: target.uuid },
            });
            return {
              outcome: "SUCCEEDED",
              result: row ? toReadResult(row) : null,
            };
          }
          const rows = await this.db.yusuf_inbox_messages.findMany({
            where: target.status ? { status: target.status } : {},
            take: LIST_SCAN_LIMIT,
            orderBy: { createdAt: "desc" },
          });
          return {
            outcome: "SUCCEEDED",
            result: { items: rows.map(toReadResult) },
          };
        }
        case "inbox.record_message": {
          if (
            typeof payload.sender !== "string" ||
            typeof payload.subject !== "string"
          )
            throw certainFailure("sender and subject are required.");
          const digest = entryDigest(payload);
          const sanitized = redactForPersistence({
            sender: payload.sender,
            subject: payload.subject,
            snippet: payload.snippet,
          });
          const row = await this.db.yusuf_inbox_messages.create({
            data: {
              uuid: target.uuid,
              sender: sanitized.sender,
              subject: sanitized.subject,
              snippet: sanitized.snippet || null,
              classification: null,
              status: payload.status,
              draftReplyBody: null,
              linkedCareerOpportunityUuid: null,
              createdByPrincipalType: prepared.intent.requestedByPrincipalType,
              createdByPrincipalId: prepared.intent.requestedByPrincipalId,
              digest,
            },
          });
          return {
            outcome: "SUCCEEDED",
            externalReference: `inbox:${row.uuid}`,
            result: { uuid: row.uuid, status: row.status, digest: row.digest },
          };
        }
        case "inbox.classify_message": {
          const existing = await this.db.yusuf_inbox_messages.findUnique({
            where: { uuid: target.uuid },
          });
          if (!existing)
            throw certainFailure(`Unknown inbox message: ${target.uuid}`);
          // Re-checked against the current row, not trusted from the request
          // builder's earlier check — same defense-in-depth placement as
          // every prior tracking phase's transition recheck.
          if (!isValidTransition(existing.status, target.status))
            throw certainFailure(
              `Illegal transition: ${existing.status} -> ${target.status}.`
            );
          const digest = entryDigest({
            sender: existing.sender,
            subject: existing.subject,
            snippet: existing.snippet,
            classification: payload.classification,
            status: target.status,
            draftReplyBody: existing.draftReplyBody,
            linkedCareerOpportunityUuid: payload.linkedCareerOpportunityUuid,
          });
          const row = await this.db.yusuf_inbox_messages.update({
            where: { uuid: target.uuid },
            data: {
              status: target.status,
              classification: payload.classification,
              linkedCareerOpportunityUuid: payload.linkedCareerOpportunityUuid,
              digest,
            },
          });
          return {
            outcome: "SUCCEEDED",
            externalReference: `inbox:${row.uuid}`,
            result: { uuid: row.uuid, status: row.status, digest: row.digest },
          };
        }
        case "inbox.prepare_reply": {
          const existing = await this.db.yusuf_inbox_messages.findUnique({
            where: { uuid: target.uuid },
          });
          if (!existing)
            throw certainFailure(`Unknown inbox message: ${target.uuid}`);
          if (!isValidTransition(existing.status, target.status))
            throw certainFailure(
              `Illegal transition: ${existing.status} -> ${target.status}.`
            );
          const sanitizedDraft = redactForPersistence(payload.draftReplyBody);
          const digest = entryDigest({
            sender: existing.sender,
            subject: existing.subject,
            snippet: existing.snippet,
            classification: existing.classification,
            status: target.status,
            draftReplyBody: sanitizedDraft,
            linkedCareerOpportunityUuid: existing.linkedCareerOpportunityUuid,
          });
          const row = await this.db.yusuf_inbox_messages.update({
            where: { uuid: target.uuid },
            data: {
              status: target.status,
              draftReplyBody: sanitizedDraft,
              digest,
            },
          });
          return {
            outcome: "SUCCEEDED",
            externalReference: `inbox:${row.uuid}`,
            result: { uuid: row.uuid, status: row.status, digest: row.digest },
          };
        }
        case "inbox.archive_local": {
          const existing = await this.db.yusuf_inbox_messages.findUnique({
            where: { uuid: target.uuid },
          });
          if (!existing)
            throw certainFailure(`Unknown inbox message: ${target.uuid}`);
          if (!isValidTransition(existing.status, target.status))
            throw certainFailure(
              `Illegal transition: ${existing.status} -> ${target.status}.`
            );
          const digest = entryDigest({
            sender: existing.sender,
            subject: existing.subject,
            snippet: existing.snippet,
            classification: existing.classification,
            status: target.status,
            draftReplyBody: existing.draftReplyBody,
            linkedCareerOpportunityUuid: existing.linkedCareerOpportunityUuid,
          });
          const row = await this.db.yusuf_inbox_messages.update({
            where: { uuid: target.uuid },
            data: { status: target.status, digest },
          });
          return {
            outcome: "SUCCEEDED",
            externalReference: `inbox:${row.uuid}`,
            result: { uuid: row.uuid, status: row.status, digest: row.digest },
          };
        }
        case "inbox.advance_linked_career_status": {
          // Full independent recheck against fresh reads — never trusts the
          // request builder's earlier check. This is the only path Inbox has
          // into Career's state machine; it must hold the identical
          // linkage+classification+transition guarantees on its own, since a
          // TOCTOU gap here would be exactly the seam-bypass independent
          // review flagged as a P1 in the earlier design.
          const message = await this.db.yusuf_inbox_messages.findUnique({
            where: { uuid: target.sourceInboxMessageUuid },
          });
          if (!message)
            throw certainFailure(
              `Unknown inbox message: ${target.sourceInboxMessageUuid}`
            );
          if (message.linkedCareerOpportunityUuid !== target.uuid)
            throw certainFailure(
              `Inbox message ${message.uuid} is not linked to career opportunity ${target.uuid}.`
            );
          if (
            !CAREER_ADVANCING_CLASSIFICATIONS.includes(message.classification)
          )
            throw certainFailure(
              `Inbox message classification ${message.classification} does not authorize a career status change.`
            );
          const opportunity =
            await this.db.yusuf_career_opportunities.findUnique({
              where: { uuid: target.uuid },
            });
          if (!opportunity)
            throw certainFailure(`Unknown career opportunity: ${target.uuid}`);
          if (!isValidCareerTransition(opportunity.status, target.status))
            throw certainFailure(
              `Illegal transition: ${opportunity.status} -> ${target.status}.`
            );
          const digest = careerEntryDigest({
            company: opportunity.company,
            role: opportunity.role,
            source: opportunity.source,
            status: target.status,
            notes: opportunity.notes,
            applicationNotes: opportunity.applicationNotes,
          });
          const row = await this.db.yusuf_career_opportunities.update({
            where: { uuid: target.uuid },
            data: { status: target.status, digest },
          });
          return {
            outcome: "SUCCEEDED",
            externalReference: `career:${row.uuid}`,
            result: { uuid: row.uuid, status: row.status, digest: row.digest },
          };
        }
        default:
          throw certainFailure(
            `Unsupported inbox capability: ${capabilityKey}`
          );
      }
    } catch (error) {
      if (error.effectCertain !== undefined) throw error;
      throw Object.assign(error, { effectCertain: false });
    }
  }

  async verify(intent, executionResult) {
    if (
      intent.capabilityKey === "inbox.list_messages" ||
      intent.capabilityKey === "inbox.read_message"
    )
      return { status: "VERIFIED", result: {}, evidence: [] };
    const target = JSON.parse(intent.canonicalTarget || "{}");
    const table =
      intent.capabilityKey === "inbox.advance_linked_career_status"
        ? this.db.yusuf_career_opportunities
        : this.db.yusuf_inbox_messages;
    const row = await table.findUnique({ where: { uuid: target.uuid } });
    const expected = executionResult?.result?.digest;
    return row && row.digest === expected
      ? {
          status: "VERIFIED",
          result: { digest: row.digest },
          evidence: [{ type: "inbox-digest", digest: row.digest }],
        }
      : { status: "NOT_APPLIED", result: {}, evidence: [] };
  }

  async reconcile(intent) {
    if (
      intent.capabilityKey === "inbox.list_messages" ||
      intent.capabilityKey === "inbox.read_message"
    )
      return { status: "NOT_APPLIED" };
    const target = JSON.parse(intent.canonicalTarget || "{}");
    const table =
      intent.capabilityKey === "inbox.advance_linked_career_status"
        ? this.db.yusuf_career_opportunities
        : this.db.yusuf_inbox_messages;
    const row = await table.findUnique({ where: { uuid: target.uuid } });
    return {
      status: row && row.status === target.status ? "VERIFIED" : "NOT_APPLIED",
    };
  }
}

module.exports = { InboxAdapter, CAPABILITIES, entryDigest, RESOURCE_TYPE };
