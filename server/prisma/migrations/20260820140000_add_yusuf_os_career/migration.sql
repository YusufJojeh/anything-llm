-- CreateTable
CREATE TABLE "yusuf_career_opportunities" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "uuid" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "source" TEXT,
    "status" TEXT NOT NULL CHECK ("status" IN ('RESEARCHING', 'APPLIED', 'INTERVIEWING', 'OFFER', 'REJECTED', 'WITHDRAWN')),
    "notes" TEXT,
    "createdByPrincipalType" TEXT NOT NULL,
    "createdByPrincipalId" TEXT NOT NULL,
    "digest" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "yusuf_career_opportunities_uuid_key" ON "yusuf_career_opportunities"("uuid");

-- CreateIndex
CREATE INDEX "yusuf_career_opportunities_status_createdAt_idx" ON "yusuf_career_opportunities"("status", "createdAt");
