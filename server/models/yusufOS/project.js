const { randomUUID } = require("crypto");
const prisma = require("../../utils/prisma");

const YusufProject = {
  create: (data, db = prisma) =>
    db.yusuf_projects.create({
      data: {
        uuid: randomUUID(),
        key: data.key,
        name: data.name,
        status: data.status || "ACTIVE",
        metadata: JSON.stringify(data.metadata || {}),
      },
    }),
  get: (where, db = prisma) => db.yusuf_projects.findFirst({ where }),
  list: (where = {}, db = prisma) =>
    db.yusuf_projects.findMany({ where, orderBy: { createdAt: "asc" } }),
};

module.exports = { YusufProject };
