const { randomUUID } = require("crypto");
const prisma = require("../../utils/prisma");
const {
  conditionalTransition,
} = require("../../domain/yusufOS/state/transitions");

const YusufTask = {
  create: (data, db = prisma) =>
    db.yusuf_tasks.create({
      data: {
        uuid: randomUUID(),
        projectId: data.projectId || null,
        parentTaskId: data.parentTaskId || null,
        assignedAgentId: data.assignedAgentId || null,
        requestedByPrincipalType: data.principal.type,
        requestedByPrincipalId: String(data.principal.id),
        title: data.title,
        objective: data.objective,
        priority: data.priority || "P2",
        status: data.status || "PLANNED",
        completionGates: JSON.stringify(data.completionGates || []),
        requestId: data.requestId,
        deadline: data.deadline || null,
      },
    }),
  get: (where, db = prisma) => db.yusuf_tasks.findFirst({ where }),
  list: (where = {}, db = prisma) =>
    db.yusuf_tasks.findMany({ where, orderBy: { updatedAt: "desc" } }),
  transition: ({ id, version, from, to, data }, db = prisma) =>
    conditionalTransition({
      delegate: db.yusuf_tasks,
      id,
      version,
      from,
      to,
      machine: "task",
      data,
    }),
};

module.exports = { YusufTask };
