const {
  canTransition,
  assertTransition,
} = require("../../../domain/yusufOS/state/transitions");

describe("Yusuf OS state machines", () => {
  test("allows only declared approval lifecycle transitions", () => {
    expect(canTransition("approval", "PENDING", "APPROVED")).toBe(true);
    expect(canTransition("approval", "APPROVED", "CONSUMED")).toBe(true);
    expect(canTransition("approval", "CONSUMED", "APPROVED")).toBe(false);
  });

  test("FAILED_UNKNOWN cannot return directly to execution", () => {
    expect(canTransition("intent", "FAILED_UNKNOWN", "EXECUTING")).toBe(false);
    expect(canTransition("intent", "FAILED_UNKNOWN", "VERIFIED")).toBe(true);
  });

  test("illegal transitions raise a stable error code", () => {
    try {
      assertTransition("intent", "VERIFIED", "EXECUTING");
      throw new Error("Expected transition to fail.");
    } catch (error) {
      expect(error.code).toBe("INVALID_STATE_TRANSITION");
    }
  });
});
