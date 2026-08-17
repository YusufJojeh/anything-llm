const { randomUUID } = require("crypto");
const prisma = require("../../utils/prisma");

const YusufGitRepository = {
  create: (data, db = prisma) =>
    db.yusuf_git_repositories.create({
      data: {
        uuid: randomUUID(),
        projectId: data.projectId,
        key: data.key,
        canonicalRoot: data.canonicalRoot,
        defaultBranch: data.defaultBranch || "main",
        protectedBranches: JSON.stringify(data.protectedBranches || []),
        allowedRemoteName: data.allowedRemoteName || "origin",
        allowedRemoteIdentity: data.allowedRemoteIdentity,
        allowLocalCommit: Boolean(data.allowLocalCommit),
        allowFeaturePush: Boolean(data.allowFeaturePush),
        status: data.status || "ACTIVE",
      },
    }),
  get: (where, db = prisma) => db.yusuf_git_repositories.findFirst({ where }),
  getByUuid: (uuid, db = prisma) =>
    db.yusuf_git_repositories.findUnique({ where: { uuid } }),
  list: (where = {}, db = prisma) =>
    db.yusuf_git_repositories.findMany({
      where,
      orderBy: { createdAt: "asc" },
    }),
};

module.exports = { YusufGitRepository };
