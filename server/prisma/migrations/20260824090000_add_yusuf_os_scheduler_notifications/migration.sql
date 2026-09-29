CREATE TABLE "yusuf_schedules" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "uuid" TEXT NOT NULL,
  "scheduleKey" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "intervalSeconds" INTEGER NOT NULL,
  "nextRunAt" DATETIME NOT NULL,
  "lastRunAt" DATETIME,
  "failureCount" INTEGER NOT NULL DEFAULT 0,
  "lastErrorCode" TEXT,
  "leaseId" TEXT,
  "leaseExpiresAt" DATETIME,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "yusuf_schedules_uuid_key" ON "yusuf_schedules"("uuid");
CREATE UNIQUE INDEX "yusuf_schedules_scheduleKey_key" ON "yusuf_schedules"("scheduleKey");
CREATE INDEX "yusuf_schedules_status_nextRunAt_idx" ON "yusuf_schedules"("status", "nextRunAt");
CREATE INDEX "yusuf_schedules_leaseExpiresAt_idx" ON "yusuf_schedules"("leaseExpiresAt");

CREATE TABLE "yusuf_notifications" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "uuid" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "dedupeKey" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "taskId" INTEGER,
  "runId" INTEGER,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acknowledgedAt" DATETIME
);
CREATE UNIQUE INDEX "yusuf_notifications_uuid_key" ON "yusuf_notifications"("uuid");
CREATE UNIQUE INDEX "yusuf_notifications_dedupeKey_key" ON "yusuf_notifications"("dedupeKey");
CREATE INDEX "yusuf_notifications_status_severity_createdAt_idx" ON "yusuf_notifications"("status", "severity", "createdAt");
