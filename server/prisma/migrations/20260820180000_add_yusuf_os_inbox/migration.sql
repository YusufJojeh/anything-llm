-- CreateTable
CREATE TABLE "yusuf_inbox_messages" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "uuid" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "snippet" TEXT,
    "classification" TEXT CHECK ("classification" IN ('OPPORTUNITY', 'INTERVIEW', 'REJECTION', 'BOUNCE', 'OTHER')),
    "status" TEXT NOT NULL CHECK ("status" IN ('NEW', 'TRIAGED', 'DRAFTED', 'ARCHIVED_LOCAL')),
    "draftReplyBody" TEXT,
    "linkedCareerOpportunityUuid" TEXT,
    "createdByPrincipalType" TEXT NOT NULL,
    "createdByPrincipalId" TEXT NOT NULL,
    "digest" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "yusuf_inbox_messages_uuid_key" ON "yusuf_inbox_messages"("uuid");

-- CreateIndex
CREATE INDEX "yusuf_inbox_messages_status_createdAt_idx" ON "yusuf_inbox_messages"("status", "createdAt");
