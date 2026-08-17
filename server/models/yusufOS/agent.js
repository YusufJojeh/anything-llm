const { randomUUID } = require("crypto");
const prisma = require("../../utils/prisma");

const YusufAgent = {
  create: async function (data, db = prisma) {
    return db.yusuf_agents.create({
      data: {
        uuid: randomUUID(),
        key: data.key,
        name: data.name,
        mission: data.mission,
        instructions: data.instructions,
        status: data.status || "DRAFT",
        modelPolicyRef: data.modelPolicyRef || null,
        approvalPolicyRef: data.approvalPolicyRef || null,
        escalationAgentId: data.escalationAgentId || null,
        maxConcurrentRuns: data.maxConcurrentRuns || 1,
      },
    });
  },
  get: (where, db = prisma) => db.yusuf_agents.findFirst({ where }),
  list: (where = {}, db = prisma) =>
    db.yusuf_agents.findMany({ where, orderBy: { createdAt: "asc" } }),
  grantCapability: async function (agentId, grant, db = prisma) {
    return db.yusuf_agent_capabilities.upsert({
      where: {
        agentId_capabilityKey: {
          agentId: Number(agentId),
          capabilityKey: grant.capabilityKey,
        },
      },
      create: {
        agentId: Number(agentId),
        capabilityKey: grant.capabilityKey,
        capabilityVersion: grant.capabilityVersion,
        resourceConstraints: JSON.stringify(grant.resourceConstraints || {}),
        targetConstraints: JSON.stringify(grant.targetConstraints || {}),
        payloadConstraints: JSON.stringify(grant.payloadConstraints || {}),
        enabled: grant.enabled !== false,
      },
      update: {
        capabilityVersion: grant.capabilityVersion,
        resourceConstraints: JSON.stringify(grant.resourceConstraints || {}),
        targetConstraints: JSON.stringify(grant.targetConstraints || {}),
        payloadConstraints: JSON.stringify(grant.payloadConstraints || {}),
        enabled: grant.enabled !== false,
        version: { increment: 1 },
      },
    });
  },
};

module.exports = { YusufAgent };
