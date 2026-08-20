const {
  evaluateSystemHealth,
  evaluateCheck,
  SYSTEM_HEALTH_THRESHOLDS,
} = require("../../../domain/yusufOS/monitoring/thresholds");
const { MONITORING_CHECK_KEYS } = require("../../../domain/yusufOS/constants");

function snapshot(overrides = {}) {
  return {
    pendingApprovals: 0,
    unresolvedIntents: 0,
    controlPlaneHealthy: true,
    killSwitchEngaged: false,
    ...overrides,
  };
}

describe("Phase K — monitoring/thresholds", () => {
  test("a clean snapshot is OK", () => {
    const result = evaluateSystemHealth(snapshot());
    expect(result.status).toBe("OK");
    expect(result.summary).toMatch(/within threshold/);
  });

  test("pendingApprovals at the WARN threshold is WARN, below it is OK", () => {
    const { warn } = SYSTEM_HEALTH_THRESHOLDS.pendingApprovals;
    expect(evaluateSystemHealth(snapshot({ pendingApprovals: warn - 1 })).status).toBe("OK");
    expect(evaluateSystemHealth(snapshot({ pendingApprovals: warn })).status).toBe("WARN");
  });

  test("pendingApprovals at the BREACH threshold is BREACH", () => {
    const { breach } = SYSTEM_HEALTH_THRESHOLDS.pendingApprovals;
    expect(evaluateSystemHealth(snapshot({ pendingApprovals: breach })).status).toBe("BREACH");
  });

  test("a single unresolved intent is already WARN", () => {
    expect(evaluateSystemHealth(snapshot({ unresolvedIntents: 1 })).status).toBe("WARN");
  });

  test("unresolvedIntents at the BREACH threshold is BREACH", () => {
    const { breach } = SYSTEM_HEALTH_THRESHOLDS.unresolvedIntents;
    expect(evaluateSystemHealth(snapshot({ unresolvedIntents: breach })).status).toBe("BREACH");
  });

  test("a degraded control plane is always BREACH regardless of other signals", () => {
    const result = evaluateSystemHealth(snapshot({ controlPlaneHealthy: false }));
    expect(result.status).toBe("BREACH");
    expect(result.summary).toMatch(/control plane DEGRADED/);
  });

  test("the worst of multiple simultaneous signals wins", () => {
    const result = evaluateSystemHealth(
      snapshot({ pendingApprovals: 5, unresolvedIntents: 5 })
    );
    expect(result.status).toBe("BREACH");
  });

  test("an engaged kill switch is reported but does not by itself escalate status", () => {
    const result = evaluateSystemHealth(snapshot({ killSwitchEngaged: true }));
    expect(result.status).toBe("OK");
    expect(result.summary).toMatch(/emergency stop engaged/);
  });

  test("evaluateCheck dispatches SYSTEM_HEALTH to the same evaluator", () => {
    const direct = evaluateSystemHealth(snapshot({ pendingApprovals: 10 }));
    const dispatched = evaluateCheck(
      MONITORING_CHECK_KEYS.SYSTEM_HEALTH,
      snapshot({ pendingApprovals: 10 })
    );
    expect(dispatched).toEqual(direct);
  });

  test("evaluateCheck throws for an unregistered checkKey", () => {
    expect(() => evaluateCheck("NOT_REAL", snapshot())).toThrow();
  });

  test("threshold output is JSON-serializable (no functions, no undefined)", () => {
    const result = evaluateSystemHealth(snapshot({ pendingApprovals: 6 }));
    expect(() => JSON.stringify(result.threshold)).not.toThrow();
    expect(JSON.parse(JSON.stringify(result.threshold))).toEqual(
      SYSTEM_HEALTH_THRESHOLDS
    );
  });
});
