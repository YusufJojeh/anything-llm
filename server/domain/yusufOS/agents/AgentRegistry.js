const prisma = require("../../../utils/prisma");
const { YusufAgent } = require("../../../models/yusufOS/agent");
const { getCapability } = require("../capabilities/registry");
const {
  AGENT_DEFINITIONS,
  getAgentDefinition,
  isCapabilityAllowedForAgent,
} = require("./definitions");
const { YusufOSError, ErrorCodes } = require("../errors/YusufOSError");

/**
 * Seeds/updates the code-owned AgentDefinitions and their capability grants.
 *
 * The security property here is the `isCapabilityAllowedForAgent` check: a
 * grant that is not in the role's code-owned allowlist is refused outright, so
 * an operator (or a bug, or a compromised config path) cannot quietly give the
 * Reviewer a write capability or let Chief of Staff inherit Engineering's.
 */
async function ensureAgent(agentKey, db = prisma) {
  const definition = getAgentDefinition(agentKey);
  if (!definition)
    throw new YusufOSError(
      ErrorCodes.NOT_FOUND,
      `Unknown agent definition: ${agentKey}`,
      { status: 404 }
    );

  let agent = await db.yusuf_agents.findUnique({
    where: { key: definition.key },
  });
  if (!agent) {
    agent = await YusufAgent.create(
      {
        key: definition.key,
        name: definition.name,
        mission: definition.mission,
        instructions: definition.instructions,
        status: definition.status,
        modelPolicyRef: JSON.stringify(definition.modelPolicy),
        maxConcurrentRuns: definition.maxConcurrentRuns,
      },
      db
    );
  }

  for (const capabilityKey of definition.allowedCapabilities) {
    assertGrantAllowed(definition.key, capabilityKey);
    const capability = getCapability(capabilityKey);
    if (!capability)
      throw new YusufOSError(
        ErrorCodes.VALIDATION_ERROR,
        `Agent definition references an unregistered capability: ${capabilityKey}`,
        { status: 422 }
      );
    await YusufAgent.grantCapability(
      agent.id,
      { capabilityKey, capabilityVersion: capability.version },
      db
    );
  }
  return agent;
}

function assertGrantAllowed(agentKey, capabilityKey) {
  if (!isCapabilityAllowedForAgent(agentKey, capabilityKey))
    throw new YusufOSError(
      ErrorCodes.ACTION_FORBIDDEN,
      `Capability ${capabilityKey} is not permitted for agent role ${agentKey}.`,
      { status: 403, details: { agentKey, capabilityKey } }
    );
  return true;
}

async function ensureCoreStaff(db = prisma) {
  const agents = {};
  for (const key of Object.keys(AGENT_DEFINITIONS)) {
    agents[key] = await ensureAgent(key, db);
  }
  return agents;
}

async function getAgentByKey(key, db = prisma) {
  return db.yusuf_agents.findUnique({ where: { key } });
}

/**
 * Server-side authority check used by services that must know *which role* is
 * acting — never derived from model output or a caller-supplied string.
 */
async function assertAgentRole(agentId, expectedKey, db = prisma) {
  const agent = await db.yusuf_agents.findUnique({
    where: { id: Number(agentId) },
  });
  if (!agent || agent.key !== expectedKey || agent.status !== "ACTIVE")
    throw new YusufOSError(
      ErrorCodes.UNAUTHORIZED,
      `This operation requires the ${expectedKey} agent.`,
      { status: 403, details: { expectedKey, actualKey: agent?.key || null } }
    );
  return agent;
}

module.exports = {
  ensureAgent,
  ensureCoreStaff,
  getAgentByKey,
  assertAgentRole,
  assertGrantAllowed,
};
