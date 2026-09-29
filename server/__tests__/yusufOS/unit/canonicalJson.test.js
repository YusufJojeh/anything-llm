const {
  canonicalize,
  canonicalHash,
  normalize,
} = require("../../../domain/yusufOS/security/canonicalJson");
const {
  canonicalizeActionRequest,
} = require("../../../domain/yusufOS/actions/IntentCanonicalizer");

describe("Yusuf OS canonicalization", () => {
  test("object key order does not change canonical JSON or hash", () => {
    const left = { z: 1, nested: { b: true, a: "value" } };
    const right = { nested: { a: "value", b: true }, z: 1 };
    expect(canonicalize(left)).toBe(canonicalize(right));
    expect(canonicalHash(left)).toBe(canonicalHash(right));
  });

  test("unicode-equivalent strings normalize identically", () => {
    expect(canonicalHash({ value: "e\u0301" })).toBe(
      canonicalHash({ value: "é" })
    );
  });

  test("semantic action payload hashes ignore input key order", () => {
    const base = {
      principal: { type: "AGENT", id: "engineering" },
      agentId: 1,
      taskId: 1,
      runId: 1,
      capability: "core.local_mutation",
      resource: { type: "test.fixture", id: "one", version: "v1" },
      environment: "LOCAL",
      requestId: "req-1",
    };
    const left = canonicalizeActionRequest({
      ...base,
      target: { b: 2, a: 1 },
      payload: { nested: { y: 2, x: 1 } },
    });
    const right = canonicalizeActionRequest({
      ...base,
      target: { a: 1, b: 2 },
      payload: { nested: { x: 1, y: 2 } },
    });
    expect(left.payloadHash).toBe(right.payloadHash);
    expect(left.targetIdentityDigest).toBe(right.targetIdentityDigest);
  });

  test.each([
    "riskLevel",
    "requiresApproval",
    "idempotencyKey",
    "executionKey",
  ])("rejects client-authoritative %s", (field) => {
    expect(() =>
      canonicalizeActionRequest({
        principal: { type: "AGENT", id: "engineering" },
        agentId: 1,
        taskId: 1,
        runId: 1,
        capability: "core.local_mutation",
        resource: { type: "test.fixture", id: "one" },
        target: {},
        payload: {},
        requestId: "req-1",
        [field]: field === "riskLevel" ? "L0" : true,
      })
    ).toThrow("cannot supply policy, risk, adapter, or execution authority");
  });

  test("rejects raw secrets before hashing or persistence", () => {
    expect(() =>
      canonicalizeActionRequest({
        principal: { type: "AGENT", id: "engineering" },
        agentId: 1,
        taskId: 1,
        runId: 1,
        capability: "core.local_mutation",
        resource: { type: "test.fixture", id: "one" },
        target: { Authorization: "Bearer target-secret" },
        payload: { nested: { access_token: "payload-secret" } },
        requestId: "req-1",
      })
    ).toThrow("never raw secret material");
  });

  test("accepts opaque secret references without persisting their sensitive key", () => {
    const request = canonicalizeActionRequest({
      principal: { type: "AGENT", id: "engineering" },
      agentId: 1,
      taskId: 1,
      runId: 1,
      capability: "core.local_mutation",
      resource: { type: "test.fixture", id: "one" },
      target: {},
      payload: { accessToken: { secretRef: "local/keyring/demo" } },
      requestId: "req-1",
    });
    expect(request.canonicalPayload).not.toContain("local/keyring/demo");
    expect(request.canonicalPayload).toContain("[REDACTED]");
    expect(request.payloadHash).toMatch(/^[a-f0-9]{64}$/);
  });

  test.each([
    `ghp_${"a".repeat(36)}`,
    `sk-proj-${"b".repeat(32)}`,
    `AKIA${"C".repeat(16)}`,
  ])("rejects provider credential material in generic fields", (credential) => {
    expect(() =>
      canonicalizeActionRequest({
        principal: { type: "AGENT", id: "engineering" },
        agentId: 1,
        taskId: 1,
        runId: 1,
        capability: "core.local_mutation",
        resource: { type: "test.fixture", id: "one" },
        target: {},
        payload: { value: credential },
        requestId: "req-1",
      })
    ).toThrow("never raw secret material");
  });

  test("a deeply nested value fails closed instead of exhausting the stack", () => {
    function nested(depth) {
      let value = { leaf: true };
      for (let i = 0; i < depth; i += 1) value = { child: value };
      return value;
    }
    expect(() => normalize(nested(64))).toThrow(/maximum nesting depth/);
    expect(normalize(nested(10))).toBeTruthy();
  });
});
