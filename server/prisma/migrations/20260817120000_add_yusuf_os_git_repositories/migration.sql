-- Gate D: project-owned repository binding. Additive only; no existing
-- yusuf_* table is altered. Hard security invariants remain code-owned in
-- server/domain/yusufOS/capabilities/registry.js and are not affected by
-- this table.

-- CreateTable
CREATE TABLE "yusuf_git_repositories" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "uuid" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "canonicalRoot" TEXT NOT NULL,
    "defaultBranch" TEXT NOT NULL DEFAULT 'main',
    "protectedBranches" TEXT NOT NULL DEFAULT '[]',
    "allowedRemoteName" TEXT NOT NULL DEFAULT 'origin',
    "allowedRemoteIdentity" TEXT NOT NULL,
    "allowLocalCommit" BOOLEAN NOT NULL DEFAULT false,
    "allowFeaturePush" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "yusuf_git_repositories_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "yusuf_projects" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "yusuf_git_repositories_uuid_key" ON "yusuf_git_repositories"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "yusuf_git_repositories_canonicalRoot_key" ON "yusuf_git_repositories"("canonicalRoot");

-- CreateIndex
CREATE INDEX "yusuf_git_repositories_status_idx" ON "yusuf_git_repositories"("status");

-- CreateIndex
CREATE UNIQUE INDEX "yusuf_git_repositories_projectId_key_key" ON "yusuf_git_repositories"("projectId", "key");
