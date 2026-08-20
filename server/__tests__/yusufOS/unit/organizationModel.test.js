const fs = require("fs");
const path = require("path");
const { AGENT_DEFINITIONS, getAgentDefinition } = require("../../../domain/yusufOS/agents/definitions");
const {
  DEPARTMENTS,
  getDepartment,
  listDepartments,
  departmentForAgent,
} = require("../../../domain/yusufOS/organization/departments");
const { AGENT_KEYS, DEPARTMENT_KEYS, AUTONOMY_LEVELS, RISK_LEVELS } = require("../../../domain/yusufOS/constants");
const { getCapability } = require("../../../domain/yusufOS/capabilities/registry");

/**
 * The organization model (docs/yusuf-os/gate-b/organization-model.md) is a code-owned grouping
 * layer over the existing AgentDefinitions — no new Agent, no new Job/Workflow primitive, no
 * database table. Its one security-relevant property is that it must never become a second path to
 * approval requirements: PolicyEngine/ApprovalService/the capability registry must stay entirely
 * ignorant of Department and AutonomyLevel.
 */

describe("organization model — Departments", () => {
  test("every AgentDefinition belongs to exactly one real, resolvable Department", () => {
    for (const definition of Object.values(AGENT_DEFINITIONS)) {
      expect(definition.departmentKey).toBeTruthy();
      const department = getDepartment(definition.departmentKey);
      expect(department).toBeTruthy();
      expect(department.memberAgentKeys).toContain(definition.key);
    }
  });

  test("every Department's memberAgentKeys resolve to a real AgentDefinition that agrees it belongs there", () => {
    for (const department of listDepartments()) {
      expect(department.memberAgentKeys.length).toBeGreaterThan(0);
      for (const agentKey of department.memberAgentKeys) {
        const definition = getAgentDefinition(agentKey);
        expect(definition).toBeTruthy();
        expect(definition.departmentKey).toBe(department.key);
      }
    }
  });

  test("no Department is empty or orphaned — the registry has exactly the four real departments", () => {
    expect(Object.keys(DEPARTMENTS).sort()).toEqual(
      [
        DEPARTMENT_KEYS.SYSTEM_CORE,
        DEPARTMENT_KEYS.ENGINEERING,
        DEPARTMENT_KEYS.MONITORING,
        DEPARTMENT_KEYS.CAREER,
      ].sort()
    );
  });

  test("getDepartment returns null for an unknown key rather than throwing", () => {
    expect(getDepartment("no_such_department")).toBeNull();
  });

  test("departmentForAgent resolves the Chief of Staff to System Core and Engineering/Reviewer to Engineering", () => {
    expect(departmentForAgent(AGENT_KEYS.CHIEF_OF_STAFF).key).toBe(DEPARTMENT_KEYS.SYSTEM_CORE);
    expect(departmentForAgent(AGENT_KEYS.ENGINEERING).key).toBe(DEPARTMENT_KEYS.ENGINEERING);
    expect(departmentForAgent(AGENT_KEYS.REVIEWER).key).toBe(DEPARTMENT_KEYS.ENGINEERING);
  });

  test("departmentForAgent returns null for an unknown agent rather than throwing", () => {
    expect(departmentForAgent("no_such_agent")).toBeNull();
  });
});

describe("organization model — AutonomyLevel", () => {
  test("every AgentDefinition declares a recognized AutonomyLevel", () => {
    const known = new Set(Object.values(AUTONOMY_LEVELS));
    for (const definition of Object.values(AGENT_DEFINITIONS)) {
      expect(known.has(definition.autonomyLevel)).toBe(true);
    }
  });

  test("exactly one Agent (Monitoring) is AUTONOMOUS — everyone else stays MANUAL/SUPERVISED", () => {
    const autonomous = Object.values(AGENT_DEFINITIONS).filter(
      (d) => d.autonomyLevel === AUTONOMY_LEVELS.AUTONOMOUS
    );
    expect(autonomous.map((d) => d.key)).toEqual([AGENT_KEYS.MONITORING]);
  });

  test("a mutation-capable Agent (Engineering) is never more autonomous than MANUAL", () => {
    // Nothing here should ever be read as "so it can skip approval" — this
    // just documents today's conservative default alongside the invariant
    // test below that makes the claim structurally true, not just stated.
    const engineering = getAgentDefinition(AGENT_KEYS.ENGINEERING);
    expect(engineering.autonomyLevel).toBe(AUTONOMY_LEVELS.MANUAL);
  });

  // Phase K, docs/yusuf-os/gate-b/monitoring.md: AUTONOMOUS is now a real,
  // granted label (Monitoring), not just a reserved enum value. This is the
  // structural ceiling that keeps that label from ever quietly becoming a
  // second, softer path around approval, the same class of bug as the
  // previously-fixed scheduled-job auto-approve issue.
  test("no AUTONOMOUS-level Agent may hold a capability above L1 risk or of class EXTERNAL_MUTATION", () => {
    const autonomous = Object.values(AGENT_DEFINITIONS).filter(
      (d) => d.autonomyLevel === AUTONOMY_LEVELS.AUTONOMOUS
    );
    expect(autonomous.length).toBeGreaterThan(0);
    for (const definition of autonomous) {
      for (const capabilityKey of definition.allowedCapabilities) {
        const capability = getCapability(capabilityKey);
        expect(capability).toBeTruthy();
        expect([RISK_LEVELS.L0, RISK_LEVELS.L1]).toContain(capability.defaultRisk);
        expect(capability.operationClass).not.toBe("EXTERNAL_MUTATION");
      }
    }
  });
});

describe("organization model — never a second path to approval", () => {
  const SECURITY_KERNEL_FILES = [
    "../../../domain/yusufOS/policy/PolicyEngine.js",
    "../../../domain/yusufOS/approvals/ApprovalService.js",
    "../../../domain/yusufOS/capabilities/registry.js",
    "../../../domain/yusufOS/actions/IntentService.js",
    "../../../domain/yusufOS/execution/ExecutionCoordinator.js",
  ];

  test.each(SECURITY_KERNEL_FILES)(
    "%s never references the organization module or autonomyLevel/departmentKey",
    (relativePath) => {
      const source = fs.readFileSync(path.join(__dirname, relativePath), "utf8");
      expect(source).not.toMatch(/require\(["'].*organization/);
      expect(source).not.toMatch(/autonomyLevel/);
      expect(source).not.toMatch(/departmentKey/);
    }
  );
});
