-- Phase K: Monitoring. Additive only.

-- CreateTable
CREATE TABLE "yusuf_monitoring_checks" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "uuid" TEXT NOT NULL,
    "checkKey" TEXT NOT NULL,
    "status" TEXT NOT NULL CHECK ("status" IN ('OK', 'WARN', 'BREACH')),
    "observedValue" TEXT NOT NULL,
    "threshold" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "createdByPrincipalType" TEXT NOT NULL,
    "createdByPrincipalId" TEXT NOT NULL,
    "digest" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "yusuf_monitoring_checks_uuid_key" ON "yusuf_monitoring_checks"("uuid");
CREATE INDEX "yusuf_monitoring_checks_checkKey_createdAt_idx" ON "yusuf_monitoring_checks"("checkKey", "createdAt");
