const { DEPARTMENT_KEYS, AGENT_KEYS } = require("../constants");
const { getAgentDefinition } = require("../agents/definitions");

/**
 * Code-owned Department registry.
 *
 * A Department groups existing AgentDefinitions; it grants nothing and is not a database table.
 * See docs/yusuf-os/gate-b/organization-model.md for why this exists and what it deliberately does
 * not do: no new Agent, no new Job/Workflow primitive (yusuf_tasks/yusuf_agent_runs/yusuf_handoffs
 * already are that), and — the invariant that matters — nothing here is ever consulted by
 * PolicyEngine, ApprovalService, or the capability registry to decide whether an action requires
 * approval. A Department only appears once a real Agent belongs in it.
 */

const SYSTEM_CORE = Object.freeze({
  key: DEPARTMENT_KEYS.SYSTEM_CORE,
  name: "System Core",
  mission:
    "Coordinate Yusuf's AI staff without ever holding mutation authority itself.",
  memberAgentKeys: Object.freeze([AGENT_KEYS.CHIEF_OF_STAFF]),
});

const ENGINEERING = Object.freeze({
  key: DEPARTMENT_KEYS.ENGINEERING,
  name: "Engineering",
  mission:
    "Implement and independently review technical work inside governed capabilities.",
  memberAgentKeys: Object.freeze([AGENT_KEYS.ENGINEERING, AGENT_KEYS.REVIEWER]),
});

const DEPARTMENTS = Object.freeze({
  [DEPARTMENT_KEYS.SYSTEM_CORE]: SYSTEM_CORE,
  [DEPARTMENT_KEYS.ENGINEERING]: ENGINEERING,
});

function getDepartment(key) {
  return DEPARTMENTS[key] || null;
}

function listDepartments() {
  return Object.values(DEPARTMENTS);
}

/** The Department an Agent belongs to, resolved from the Agent's own `departmentKey`. */
function departmentForAgent(agentKey) {
  const definition = getAgentDefinition(agentKey);
  if (!definition) return null;
  return getDepartment(definition.departmentKey);
}

module.exports = {
  DEPARTMENTS,
  SYSTEM_CORE,
  ENGINEERING,
  getDepartment,
  listDepartments,
  departmentForAgent,
};
