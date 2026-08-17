-- CreateTable
CREATE TABLE "yusuf_project_commands" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "uuid" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "executable" TEXT NOT NULL,
    "args" TEXT NOT NULL DEFAULT '[]',
    "cwdRelative" TEXT NOT NULL DEFAULT '.',
    "timeoutMs" INTEGER NOT NULL DEFAULT 120000,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "yusuf_project_commands_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "yusuf_projects" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "yusuf_handoffs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "uuid" TEXT NOT NULL,
    "taskId" INTEGER NOT NULL,
    "fromAgentId" INTEGER NOT NULL,
    "toAgentId" INTEGER NOT NULL,
    "fromRunId" INTEGER,
    "toRunId" INTEGER,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING', 'ACCEPTED', 'COMPLETED', 'CANCELLED')),
    "artifacts" TEXT NOT NULL DEFAULT '[]',
    "idempotencyKey" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "acceptedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "yusuf_handoffs_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "yusuf_tasks" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "yusuf_handoffs_fromAgentId_fkey" FOREIGN KEY ("fromAgentId") REFERENCES "yusuf_agents" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "yusuf_handoffs_toAgentId_fkey" FOREIGN KEY ("toAgentId") REFERENCES "yusuf_agents" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "yusuf_handoffs_fromRunId_fkey" FOREIGN KEY ("fromRunId") REFERENCES "yusuf_agent_runs" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "yusuf_handoffs_toRunId_fkey" FOREIGN KEY ("toRunId") REFERENCES "yusuf_agent_runs" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "yusuf_review_verdicts" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "uuid" TEXT NOT NULL,
    "taskId" INTEGER NOT NULL,
    "reviewRunId" INTEGER NOT NULL,
    "targetRunId" INTEGER,
    "reviewerAgentId" INTEGER NOT NULL,
    "verdict" TEXT NOT NULL CHECK ("verdict" IN ('PASS', 'PASS_WITH_WARNINGS', 'BLOCK')),
    "summary" TEXT NOT NULL,
    "findings" TEXT NOT NULL DEFAULT '[]',
    "evidenceDigest" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "yusuf_review_verdicts_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "yusuf_tasks" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "yusuf_review_verdicts_reviewRunId_fkey" FOREIGN KEY ("reviewRunId") REFERENCES "yusuf_agent_runs" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "yusuf_review_verdicts_targetRunId_fkey" FOREIGN KEY ("targetRunId") REFERENCES "yusuf_agent_runs" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "yusuf_review_verdicts_reviewerAgentId_fkey" FOREIGN KEY ("reviewerAgentId") REFERENCES "yusuf_agents" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "yusuf_run_evidence" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "uuid" TEXT NOT NULL,
    "runId" INTEGER NOT NULL,
    "taskId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL CHECK ("kind" IN ('ANALYSIS', 'IMPLEMENTATION', 'VALIDATION')),
    "status" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "digest" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "yusuf_run_evidence_runId_fkey" FOREIGN KEY ("runId") REFERENCES "yusuf_agent_runs" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "yusuf_run_evidence_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "yusuf_tasks" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_yusuf_tasks" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "uuid" TEXT NOT NULL,
    "projectId" INTEGER,
    "parentTaskId" INTEGER,
    "assignedAgentId" INTEGER,
    "requestedByPrincipalType" TEXT NOT NULL CHECK ("requestedByPrincipalType" IN ('USER', 'AGENT', 'SCHEDULE', 'SYSTEM')),
    "requestedByPrincipalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'P2' CHECK ("priority" IN ('P0', 'P1', 'P2', 'P3')),
    "status" TEXT NOT NULL DEFAULT 'PLANNED' CHECK ("status" IN ('PLANNED', 'READY', 'RUNNING', 'BLOCKED', 'WAITING_APPROVAL', 'COMPLETED', 'FAILED', 'CANCELLED')),
    "taskKind" TEXT NOT NULL DEFAULT 'GENERAL',
    "blockedReason" TEXT,
    "completionGates" TEXT NOT NULL DEFAULT '[]',
    "requestId" TEXT NOT NULL,
    "deadline" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0),
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "yusuf_tasks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "yusuf_projects" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "yusuf_tasks_parentTaskId_fkey" FOREIGN KEY ("parentTaskId") REFERENCES "yusuf_tasks" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "yusuf_tasks_assignedAgentId_fkey" FOREIGN KEY ("assignedAgentId") REFERENCES "yusuf_agents" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_yusuf_tasks" ("assignedAgentId", "completionGates", "createdAt", "deadline", "id", "objective", "parentTaskId", "priority", "projectId", "requestId", "requestedByPrincipalId", "requestedByPrincipalType", "status", "title", "updatedAt", "uuid", "version") SELECT "assignedAgentId", "completionGates", "createdAt", "deadline", "id", "objective", "parentTaskId", "priority", "projectId", "requestId", "requestedByPrincipalId", "requestedByPrincipalType", "status", "title", "updatedAt", "uuid", "version" FROM "yusuf_tasks";
DROP TABLE "yusuf_tasks";
ALTER TABLE "new_yusuf_tasks" RENAME TO "yusuf_tasks";
CREATE UNIQUE INDEX "yusuf_tasks_uuid_key" ON "yusuf_tasks"("uuid");
CREATE INDEX "yusuf_tasks_status_priority_updatedAt_idx" ON "yusuf_tasks"("status", "priority", "updatedAt");
CREATE INDEX "yusuf_tasks_assignedAgentId_status_idx" ON "yusuf_tasks"("assignedAgentId", "status");
CREATE INDEX "yusuf_tasks_projectId_status_idx" ON "yusuf_tasks"("projectId", "status");
CREATE INDEX "yusuf_tasks_parentTaskId_idx" ON "yusuf_tasks"("parentTaskId");
CREATE INDEX "yusuf_tasks_requestId_idx" ON "yusuf_tasks"("requestId");
CREATE TABLE "new_yusuf_agent_runs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "uuid" TEXT NOT NULL,
    "taskId" INTEGER NOT NULL,
    "agentId" INTEGER,
    "requestedByPrincipalType" TEXT NOT NULL CHECK ("requestedByPrincipalType" IN ('USER', 'AGENT', 'SCHEDULE', 'SYSTEM')),
    "requestedByPrincipalId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED' CHECK ("status" IN ('QUEUED', 'RUNNING', 'WAITING_TOOL', 'WAITING_APPROVAL', 'WAITING_HANDOFF', 'WAITING_DEPENDENCY', 'BLOCKED', 'VERIFYING', 'FAILED', 'FAILED_UNKNOWN', 'COMPLETED', 'CANCELLED')),
    "runKind" TEXT NOT NULL DEFAULT 'EXECUTION' CHECK ("runKind" IN ('ORCHESTRATION', 'IMPLEMENTATION', 'REVIEW', 'EXECUTION')),
    "failureKind" TEXT,
    "blockedReason" TEXT,
    "idempotencyKey" TEXT,
    "modelRef" TEXT,
    "promptDigest" TEXT,
    "tokenUsage" TEXT,
    "estimatedCostMicros" INTEGER,
    "requestId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0),
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "yusuf_agent_runs_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "yusuf_tasks" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "yusuf_agent_runs_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "yusuf_agents" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_yusuf_agent_runs" ("agentId", "completedAt", "createdAt", "estimatedCostMicros", "id", "modelRef", "promptDigest", "requestId", "requestedByPrincipalId", "requestedByPrincipalType", "startedAt", "status", "taskId", "tokenUsage", "updatedAt", "uuid", "version") SELECT "agentId", "completedAt", "createdAt", "estimatedCostMicros", "id", "modelRef", "promptDigest", "requestId", "requestedByPrincipalId", "requestedByPrincipalType", "startedAt", "status", "taskId", "tokenUsage", "updatedAt", "uuid", "version" FROM "yusuf_agent_runs";
DROP TABLE "yusuf_agent_runs";
ALTER TABLE "new_yusuf_agent_runs" RENAME TO "yusuf_agent_runs";
CREATE UNIQUE INDEX "yusuf_agent_runs_uuid_key" ON "yusuf_agent_runs"("uuid");
CREATE UNIQUE INDEX "yusuf_agent_runs_idempotencyKey_key" ON "yusuf_agent_runs"("idempotencyKey");
CREATE INDEX "yusuf_agent_runs_taskId_status_idx" ON "yusuf_agent_runs"("taskId", "status");
CREATE INDEX "yusuf_agent_runs_agentId_status_idx" ON "yusuf_agent_runs"("agentId", "status");
CREATE INDEX "yusuf_agent_runs_requestId_idx" ON "yusuf_agent_runs"("requestId");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;

-- CreateIndex
CREATE UNIQUE INDEX "yusuf_project_commands_uuid_key" ON "yusuf_project_commands"("uuid");

-- CreateIndex
CREATE INDEX "yusuf_project_commands_projectId_enabled_idx" ON "yusuf_project_commands"("projectId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "yusuf_project_commands_projectId_key_key" ON "yusuf_project_commands"("projectId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "yusuf_handoffs_uuid_key" ON "yusuf_handoffs"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "yusuf_handoffs_idempotencyKey_key" ON "yusuf_handoffs"("idempotencyKey");

-- CreateIndex
CREATE INDEX "yusuf_handoffs_taskId_status_idx" ON "yusuf_handoffs"("taskId", "status");

-- CreateIndex
CREATE INDEX "yusuf_handoffs_toAgentId_status_idx" ON "yusuf_handoffs"("toAgentId", "status");

-- CreateIndex
CREATE INDEX "yusuf_handoffs_requestId_idx" ON "yusuf_handoffs"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "yusuf_review_verdicts_uuid_key" ON "yusuf_review_verdicts"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "yusuf_review_verdicts_reviewRunId_key" ON "yusuf_review_verdicts"("reviewRunId");

-- CreateIndex
CREATE INDEX "yusuf_review_verdicts_taskId_createdAt_idx" ON "yusuf_review_verdicts"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "yusuf_review_verdicts_verdict_idx" ON "yusuf_review_verdicts"("verdict");

-- CreateIndex
CREATE UNIQUE INDEX "yusuf_run_evidence_uuid_key" ON "yusuf_run_evidence"("uuid");

-- CreateIndex
CREATE INDEX "yusuf_run_evidence_taskId_kind_createdAt_idx" ON "yusuf_run_evidence"("taskId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "yusuf_run_evidence_runId_kind_idx" ON "yusuf_run_evidence"("runId", "kind");

