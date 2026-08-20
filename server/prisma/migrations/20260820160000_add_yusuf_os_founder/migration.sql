-- CreateTable
CREATE TABLE "yusuf_founder_ventures" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "uuid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL CHECK ("status" IN ('IDEA', 'VALIDATING', 'BUILDING', 'LAUNCHED', 'PAUSED', 'KILLED')),
    "notes" TEXT,
    "createdByPrincipalType" TEXT NOT NULL,
    "createdByPrincipalId" TEXT NOT NULL,
    "digest" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "yusuf_founder_ventures_uuid_key" ON "yusuf_founder_ventures"("uuid");

-- CreateIndex
CREATE INDEX "yusuf_founder_ventures_status_createdAt_idx" ON "yusuf_founder_ventures"("status", "createdAt");
