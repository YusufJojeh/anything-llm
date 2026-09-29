const {
  REDACTED,
  redactForPersistence,
  assertReferencesOnly,
} = require("../../../domain/yusufOS/security/redaction");

describe("Yusuf OS secret redaction", () => {
  test("redacts structured secrets recursively", () => {
    const result = redactForPersistence({
      Authorization: "Bearer secret-token",
      nested: {
        access_token: "abc",
        refreshToken: "def",
        token: "standalone-token",
        api_key: "ghi",
        client_secret: "jkl",
        password: "mno",
        Cookie: "session=secret",
      },
      safe: "visible",
    });
    expect(result.Authorization).toBe(REDACTED);
    expect(Object.values(result.nested).every((value) => value === REDACTED)).toBe(
      true
    );
    expect(result.safe).toBe("visible");
  });

  test("redacts private keys and bearer tokens embedded in strings", () => {
    const result = redactForPersistence({
      output:
        "Authorization: Bearer abc.def.ghi\n-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----",
    });
    expect(result.output).not.toContain("abc.def.ghi");
    expect(result.output).not.toContain("secret");
    expect(result.output).toContain(REDACTED);
  });

  test("redacts raw env-style and cookie header values", () => {
    const value = redactForPersistence(
      "DB_PASSWORD=unsafe Cookie: sid=unsafe\nSERVICE_API_KEY=also-unsafe"
    );
    expect(value).not.toContain("unsafe");
    expect(value).toContain(REDACTED);
  });

  function nested(depth, leaf) {
    let value = leaf;
    for (let i = 0; i < depth; i += 1) value = { child: value };
    return value;
  }

  test("a deeply nested value degrades to a safe placeholder instead of exhausting the stack", () => {
    // redactForPersistence is a best-effort sanitizer called from
    // error-handling paths, so it must never itself throw -- excess depth
    // degrades to an opaque placeholder rather than raising.
    const result = redactForPersistence(
      nested(200, { Authorization: "Bearer deep-secret" })
    );
    expect(JSON.stringify(result)).not.toContain("deep-secret");
    expect(JSON.stringify(result)).toContain("MAX_DEPTH_EXCEEDED");
    expect(redactForPersistence(nested(5, { safe: "visible" }))).toBeTruthy();
  });

  test("assertReferencesOnly rejects a deeply nested value instead of exhausting the stack", () => {
    expect(() => assertReferencesOnly(nested(200, "leaf"))).toThrow(
      /maximum nesting depth/
    );
    expect(() => assertReferencesOnly(nested(5, "leaf"))).not.toThrow();
  });
});
