const {
  assessOperationalReadiness,
  storageDirectory,
} = require("../../../domain/yusufOS/operations/operationalReadiness");

const SECRET = "a".repeat(32);

describe("Yusuf OS operational readiness", () => {
  const validEnv = {
    YUSUF_OS_AUDIT_HMAC_KEY: SECRET,
    YUSUF_OS_CONTROL_TOKEN: SECRET,
    YUSUF_OS_SCHEDULER_ENABLED: "true",
    OLLAMA_BASE_PATH: "http://ollama.internal:11434",
    YUSUF_OS_BROWSER_CDP_ENDPOINT: "http://127.0.0.1:9222",
    STORAGE_DIR: "C:/yusuf-storage",
  };

  it("accepts safe configured operations without exposing secrets", () => {
    const result = assessOperationalReadiness(validEnv, () => true);
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  it("fails closed for missing durable-control secrets and bad scheduler values", () => {
    const result = assessOperationalReadiness(
      {
        ...validEnv,
        YUSUF_OS_AUDIT_HMAC_KEY: "short",
        YUSUF_OS_CONTROL_TOKEN: undefined,
        YUSUF_OS_SCHEDULER_ENABLED: "sometimes",
      },
      () => true
    );
    expect(result.ok).toBe(false);
    expect(result.checks.filter((check) => !check.ok).map((check) => check.name)).toEqual(
      expect.arrayContaining(["audit_hmac_key", "control_token", "scheduler_flag"])
    );
  });

  it("rejects endpoint credentials, non-loopback CDP, and absent storage", () => {
    const result = assessOperationalReadiness(
      {
        ...validEnv,
        OLLAMA_BASE_PATH: "http://token@ollama.internal:11434",
        YUSUF_OS_BROWSER_CDP_ENDPOINT: "http://192.168.1.10:9222",
      },
      () => false
    );
    expect(result.ok).toBe(false);
    expect(result.checks.filter((check) => !check.ok).map((check) => check.name)).toEqual(
      expect.arrayContaining(["ollama_endpoint", "browser_cdp_endpoint", "storage_directory"])
    );
  });

  it("uses the same strict CDP contract as the Browser Broker", () => {
    for (const endpoint of [
      "https://127.0.0.1:9222",
      "http://127.0.0.1:9222/devtools",
      "http://user@127.0.0.1:9222",
    ]) {
      const result = assessOperationalReadiness(
        { ...validEnv, YUSUF_OS_BROWSER_CDP_ENDPOINT: endpoint },
        () => true
      );
      expect(
        result.checks.find((check) => check.name === "browser_cdp_endpoint").ok
      ).toBe(false);
    }
  });

  it("uses STORAGE_DIR when configured", () => {
    expect(storageDirectory({ STORAGE_DIR: "C:/yusuf-storage" })).toMatch(/yusuf-storage$/);
  });
});
