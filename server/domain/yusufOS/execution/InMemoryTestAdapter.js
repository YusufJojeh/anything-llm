const { GovernedAdapter } = require("./AdapterContract");

class InMemoryTestAdapter extends GovernedAdapter {
  constructor({ execution = "SUCCEEDED", verification = "VERIFIED" } = {}) {
    super();
    this.execution = execution;
    this.verification = verification;
    this.executionCount = 0;
    this.effects = new Map();
  }
  descriptor() {
    return {
      id: "gate-c-memory",
      kind: "TEST_ONLY",
      capabilities: ["core.local_mutation", "core.external_mutation"],
    };
  }
  async availability() {
    return { status: "AVAILABLE", account: null };
  }
  async preflight(intent) {
    const target = JSON.parse(intent.canonicalTarget || "{}");
    return {
      accountIdentity: target.accountIdentity ?? target.account ?? null,
      resourceVersion: intent.resourceVersion,
      targetIdentityDigest: intent.targetIdentityDigest,
    };
  }
  async prepare(intent) {
    return { intentId: intent.id, payloadHash: intent.payloadHash };
  }
  async execute(prepared, claim) {
    this.executionCount += 1;
    if (this.execution === "THROW_BEFORE_EFFECT")
      throw Object.assign(new Error("Test adapter failed before effect."), {
        effectCertain: true,
        effectApplied: false,
      });
    if (this.execution === "UNKNOWN")
      throw Object.assign(new Error("Test adapter outcome is unknown."), {
        effectCertain: false,
      });
    this.effects.set(claim.executionKey, prepared.payloadHash);
    return {
      outcome: "SUCCEEDED",
      externalReference: `memory:${claim.executionKey}`,
      result: { applied: true, payloadHash: prepared.payloadHash },
    };
  }
  async verify(_intent, result) {
    return {
      status: this.verification,
      result: { externalReference: result.externalReference },
      evidence: [],
    };
  }
  async reconcile(_intent, claim) {
    return this.effects.has(claim.executionKey)
      ? { status: "VERIFIED" }
      : { status: "NOT_APPLIED" };
  }
}

module.exports = { InMemoryTestAdapter };
