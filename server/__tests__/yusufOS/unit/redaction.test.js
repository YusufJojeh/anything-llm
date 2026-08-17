const {
  REDACTED,
  redactForPersistence,
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
});
