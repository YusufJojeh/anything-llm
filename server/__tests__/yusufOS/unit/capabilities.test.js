const {
  getCapability,
  isHardForbidden,
  HARD_FORBIDDEN,
} = require("../../../domain/yusufOS/capabilities/registry");

describe("Yusuf OS code-owned capabilities", () => {
  test("security-critical capability semantics are frozen in code", () => {
    const capability = getCapability("core.external_mutation");
    expect(Object.isFrozen(capability)).toBe(true);
    expect(Object.isFrozen(capability.hardFlags)).toBe(true);
    expect(Object.isFrozen(capability.inputSchema)).toBe(true);
    expect(capability.defaultRisk).toBe("L3");
    expect(capability.defaultOutcome).toBe("REQUIRE_APPROVAL");
  });

  test.each(HARD_FORBIDDEN)("%s is hard forbidden and non-approvable", (key) => {
    const capability = getCapability(key);
    expect(isHardForbidden(key)).toBe(true);
    expect(capability.defaultRisk).toBe("L4");
    expect(capability.defaultOutcome).toBe("FORBIDDEN");
    expect(capability.idempotency).toBe("NEVER_EXECUTE");
  });
});
