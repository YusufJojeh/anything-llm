-- CreateTable
CREATE TABLE "yusuf_research_items" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "uuid" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL CHECK ("status" IN ('OPEN', 'INVESTIGATING', 'ANSWERED', 'ABANDONED')),
    "notes" TEXT,
    "createdByPrincipalType" TEXT NOT NULL,
    "createdByPrincipalId" TEXT NOT NULL,
    "digest" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "yusuf_research_items_uuid_key" ON "yusuf_research_items"("uuid");

-- CreateIndex
CREATE INDEX "yusuf_research_items_status_createdAt_idx" ON "yusuf_research_items"("status", "createdAt");
