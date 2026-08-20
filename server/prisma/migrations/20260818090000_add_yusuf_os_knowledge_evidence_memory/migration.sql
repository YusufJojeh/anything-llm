-- Phase J: Evidence classification/retention + Knowledge + Memory.
-- Additive only. No existing column is altered or dropped.

-- AlterTable: yusuf_run_evidence gains classification + retention.
ALTER TABLE "yusuf_run_evidence" ADD COLUMN "evidenceClass" TEXT NOT NULL DEFAULT 'SANITIZED_OUTPUT';
ALTER TABLE "yusuf_run_evidence" ADD COLUMN "expiresAt" DATETIME;
ALTER TABLE "yusuf_run_evidence" ADD COLUMN "tombstonedAt" DATETIME;

CREATE INDEX "yusuf_run_evidence_evidenceClass_expiresAt_idx" ON "yusuf_run_evidence"("evidenceClass", "expiresAt");

-- CreateTable
CREATE TABLE "yusuf_knowledge_entries" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "uuid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL CHECK ("sourceType" IN ('AGENT_DERIVED', 'USER_PROVIDED', 'DOCUMENT_CITED')),
    "sourceRef" TEXT,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "createdByPrincipalType" TEXT NOT NULL,
    "createdByPrincipalId" TEXT NOT NULL,
    "digest" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "yusuf_knowledge_entries_uuid_key" ON "yusuf_knowledge_entries"("uuid");
CREATE INDEX "yusuf_knowledge_entries_sourceType_createdAt_idx" ON "yusuf_knowledge_entries"("sourceType", "createdAt");

-- CreateTable
CREATE TABLE "yusuf_memory_entries" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "uuid" TEXT NOT NULL,
    "scope" TEXT NOT NULL CHECK ("scope" IN ('PERSONAL', 'PROJECT', 'AGENT', 'TASK', 'CONVERSATION')),
    "scopeRef" TEXT,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdByPrincipalType" TEXT NOT NULL,
    "createdByPrincipalId" TEXT NOT NULL,
    "digest" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "yusuf_memory_entries_uuid_key" ON "yusuf_memory_entries"("uuid");
CREATE UNIQUE INDEX "yusuf_memory_entries_scope_scopeRef_key_key" ON "yusuf_memory_entries"("scope", "scopeRef", "key");
CREATE INDEX "yusuf_memory_entries_scope_scopeRef_idx" ON "yusuf_memory_entries"("scope", "scopeRef");
