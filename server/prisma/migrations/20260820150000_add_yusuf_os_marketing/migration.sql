-- CreateTable
CREATE TABLE "yusuf_marketing_content" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "uuid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "status" TEXT NOT NULL CHECK ("status" IN ('IDEA', 'DRAFTING', 'READY_FOR_REVIEW', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED')),
    "notes" TEXT,
    "createdByPrincipalType" TEXT NOT NULL,
    "createdByPrincipalId" TEXT NOT NULL,
    "digest" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "yusuf_marketing_content_uuid_key" ON "yusuf_marketing_content"("uuid");

-- CreateIndex
CREATE INDEX "yusuf_marketing_content_status_createdAt_idx" ON "yusuf_marketing_content"("status", "createdAt");
