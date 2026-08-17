const { randomUUID } = require("crypto");
const prisma = require("../../utils/prisma");
const {
  conditionalTransition,
} = require("../../domain/yusufOS/state/transitions");

const YusufAgentRun = {
  create: (data, db = prisma) =>
    db.yusuf_agent_runs.create({
      data: {
        uuid: randomUUID(),
        taskId: Number(data.taskId),
        agentId: data.agentId || null,
        requestedByPrincipalType: data.principal.type,
        requestedByPrincipalId: String(data.principal.id),
        status: data.status || "QUEUED",
        modelRef: data.modelRef ? JSON.stringify(data.modelRef) : null,
        promptDigest: data.promptDigest || null,
        requestId: data.requestId,
      },
    }),
  get: (where, db = prisma) => db.yusuf_agent_runs.findFirst({ where }),
  list: (where = {}, db = prisma) =>
    db.yusuf_agent_runs.findMany({ where, orderBy: { createdAt: "desc" } }),
  transition: ({ id, version, from, to, data }, db = prisma) =>
    conditionalTransition({
      delegate: db.yusuf_agent_runs,
      id,
      version,
      from,
      to,
      machine: "run",
      data,
    }),
};

module.exports = { YusufAgentRun };
