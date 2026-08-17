-- Yusuf OS Gate C is an additive, isolated control-plane migration.
-- Capability definitions and hard forbidden rules remain code-owned.

CREATE TABLE "yusuf_agents" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "uuid" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mission" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "modelPolicyRef" TEXT,
    "approvalPolicyRef" TEXT,
    "escalationAgentId" INTEGER,
    "maxConcurrentRuns" INTEGER NOT NULL DEFAULT 1 CHECK ("maxConcurrentRuns" > 0),
    "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0),
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "yusuf_agents_escalationAgentId_fkey" FOREIGN KEY ("escalationAgentId") REFERENCES "yusuf_agents" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "yusuf_projects" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "uuid" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0),
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "yusuf_project_policy_overrides" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER NOT NULL,
    "capabilityKey" TEXT NOT NULL,
    "effect" TEXT NOT NULL CHECK ("effect" IN ('ALLOW', 'REQUIRE_APPROVAL', 'DENY', 'FORBIDDEN')),
    "riskFloor" TEXT CHECK ("riskFloor" IS NULL OR "riskFloor" IN ('L0', 'L1', 'L2', 'L3', 'L4')),
    "constraints" TEXT NOT NULL DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0),
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "yusuf_project_policy_overrides_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "yusuf_projects" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "yusuf_tasks" (
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

CREATE TABLE "yusuf_task_dependencies" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "taskId" INTEGER NOT NULL,
    "dependsOnTaskId" INTEGER NOT NULL,
    "relation" TEXT NOT NULL DEFAULT 'BLOCKS',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "yusuf_task_dependencies_not_self" CHECK ("taskId" <> "dependsOnTaskId"),
    CONSTRAINT "yusuf_task_dependencies_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "yusuf_tasks" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "yusuf_task_dependencies_dependsOnTaskId_fkey" FOREIGN KEY ("dependsOnTaskId") REFERENCES "yusuf_tasks" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "yusuf_agent_runs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "uuid" TEXT NOT NULL,
    "taskId" INTEGER NOT NULL,
    "agentId" INTEGER,
    "requestedByPrincipalType" TEXT NOT NULL CHECK ("requestedByPrincipalType" IN ('USER', 'AGENT', 'SCHEDULE', 'SYSTEM')),
    "requestedByPrincipalId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED' CHECK ("status" IN ('QUEUED', 'RUNNING', 'WAITING_APPROVAL', 'WAITING_DEPENDENCY', 'BLOCKED', 'VERIFYING', 'FAILED', 'FAILED_UNKNOWN', 'COMPLETED', 'CANCELLED')),
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

CREATE TABLE "yusuf_agent_capabilities" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "agentId" INTEGER NOT NULL,
    "capabilityKey" TEXT NOT NULL,
    "capabilityVersion" INTEGER NOT NULL CHECK ("capabilityVersion" > 0),
    "resourceConstraints" TEXT NOT NULL DEFAULT '{}',
    "targetConstraints" TEXT NOT NULL DEFAULT '{}',
    "payloadConstraints" TEXT NOT NULL DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0),
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "yusuf_agent_capabilities_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "yusuf_agents" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "yusuf_action_intents" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "uuid" TEXT NOT NULL,
    "taskId" INTEGER NOT NULL,
    "runId" INTEGER NOT NULL,
    "agentId" INTEGER,
    "requestedByPrincipalType" TEXT NOT NULL CHECK ("requestedByPrincipalType" IN ('USER', 'AGENT', 'SCHEDULE', 'SYSTEM')),
    "requestedByPrincipalId" TEXT NOT NULL,
    "capabilityKey" TEXT NOT NULL,
    "capabilityVersion" INTEGER NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "resourceVersion" TEXT,
    "environment" TEXT NOT NULL,
    "canonicalTarget" TEXT NOT NULL,
    "canonicalPayload" TEXT NOT NULL,
    "canonicalPreconditions" TEXT NOT NULL,
    "targetIdentityDigest" TEXT NOT NULL,
    "accountIdentityDigest" TEXT,
    "payloadHash" TEXT NOT NULL,
    "intentFingerprint" TEXT NOT NULL,
    "canonicalizationVersion" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INTENT_CREATED' CHECK ("status" IN ('INTENT_CREATED', 'POLICY_EVALUATED', 'POLICY_DENIED', 'FORBIDDEN', 'WAITING_APPROVAL', 'AUTHORIZED', 'EXECUTING', 'EXECUTED_UNVERIFIED', 'VERIFIED', 'FAILED', 'FAILED_UNKNOWN', 'INVALIDATED', 'CANCELLED')),
    "activePolicyDecisionId" INTEGER,
    "requestId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0),
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "yusuf_action_intents_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "yusuf_tasks" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "yusuf_action_intents_runId_fkey" FOREIGN KEY ("runId") REFERENCES "yusuf_agent_runs" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "yusuf_action_intents_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "yusuf_agents" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "yusuf_policy_decisions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "uuid" TEXT NOT NULL,
    "intentId" INTEGER NOT NULL,
    "decisionVersion" INTEGER NOT NULL DEFAULT 1,
    "outcome" TEXT NOT NULL CHECK ("outcome" IN ('ALLOW', 'REQUIRE_APPROVAL', 'DENY', 'FORBIDDEN')),
    "riskLevel" TEXT NOT NULL CHECK ("riskLevel" IN ('L0', 'L1', 'L2', 'L3', 'L4')),
    "reasonCode" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "matchedRules" TEXT NOT NULL DEFAULT '[]',
    "evaluatedAgentPolicyRef" TEXT,
    "evaluatedProjectPolicyRef" TEXT,
    "evaluatedResourceVersions" TEXT NOT NULL DEFAULT '[]',
    "evaluatedAccountConstraint" TEXT,
    "policyBundleDigest" TEXT NOT NULL,
    "decidedByPrincipalType" TEXT NOT NULL CHECK ("decidedByPrincipalType" IN ('USER', 'AGENT', 'SCHEDULE', 'SYSTEM')),
    "decidedByPrincipalId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "decidedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "yusuf_policy_decisions_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "yusuf_action_intents" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "yusuf_approval_requests" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "uuid" TEXT NOT NULL,
    "intentId" INTEGER NOT NULL,
    "policyDecisionId" INTEGER NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "boundIntentVersion" INTEGER NOT NULL,
    "targetIdentityDigest" TEXT NOT NULL,
    "boundResourceVersions" TEXT NOT NULL DEFAULT '[]',
    "boundAccountConstraint" TEXT,
    "requiredRiskLevel" TEXT NOT NULL CHECK ("requiredRiskLevel" IN ('L3', 'L4')),
    "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'INVALIDATED', 'CONSUMED')),
    "requestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "decidedAt" DATETIME,
    "decidedByPrincipalType" TEXT CHECK ("decidedByPrincipalType" IS NULL OR "decidedByPrincipalType" = 'USER'),
    "decidedByPrincipalId" TEXT,
    "decisionNote" TEXT,
    "consumedAt" DATETIME,
    "invalidatedAt" DATETIME,
    "invalidationReason" TEXT,
    "requestId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0),
    CONSTRAINT "yusuf_approval_requests_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "yusuf_action_intents" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "yusuf_approval_requests_policyDecisionId_fkey" FOREIGN KEY ("policyDecisionId") REFERENCES "yusuf_policy_decisions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "yusuf_action_receipts" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "uuid" TEXT NOT NULL,
    "intentId" INTEGER NOT NULL,
    "executionAttempt" INTEGER NOT NULL DEFAULT 1 CHECK ("executionAttempt" > 0),
    "executionKey" TEXT NOT NULL,
    "adapterKind" TEXT NOT NULL,
    "adapterId" TEXT NOT NULL,
    "safeAccountIdentity" TEXT,
    "outcome" TEXT NOT NULL CHECK ("outcome" IN ('EXECUTING', 'SUCCEEDED', 'FAILED', 'UNKNOWN')),
    "externalReference" TEXT,
    "beforeVersions" TEXT NOT NULL DEFAULT '[]',
    "afterVersions" TEXT NOT NULL DEFAULT '[]',
    "sanitizedResult" TEXT,
    "verificationStatus" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("verificationStatus" IN ('PENDING', 'RECONCILING', 'VERIFIED', 'NOT_APPLIED', 'UNKNOWN')),
    "verificationResult" TEXT,
    "evidenceRefs" TEXT NOT NULL DEFAULT '[]',
    "requestId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0),
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "yusuf_action_receipts_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "yusuf_action_intents" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "yusuf_audit_events" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "uuid" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventType" TEXT NOT NULL,
    "principalType" TEXT NOT NULL CHECK ("principalType" IN ('USER', 'AGENT', 'SCHEDULE', 'SYSTEM')),
    "principalId" TEXT NOT NULL,
    "taskRef" TEXT,
    "runRef" TEXT,
    "intentRef" TEXT,
    "approvalRef" TEXT,
    "resourceType" TEXT,
    "resourceId" TEXT,
    "outcome" TEXT,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "requestId" TEXT NOT NULL,
    "canonicalizationVersion" INTEGER NOT NULL,
    "previousHash" TEXT NOT NULL,
    "eventHash" TEXT NOT NULL
);

CREATE TABLE "yusuf_security_settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0),
    "updatedBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "yusuf_audit_checkpoints" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "key" TEXT NOT NULL,
    "lastSequence" INTEGER NOT NULL CHECK ("lastSequence" >= 0),
    "lastHash" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "yusuf_agents_uuid_key" ON "yusuf_agents"("uuid");
CREATE UNIQUE INDEX "yusuf_agents_key_key" ON "yusuf_agents"("key");
CREATE INDEX "yusuf_agents_status_idx" ON "yusuf_agents"("status");
CREATE INDEX "yusuf_agents_escalationAgentId_idx" ON "yusuf_agents"("escalationAgentId");
CREATE UNIQUE INDEX "yusuf_projects_uuid_key" ON "yusuf_projects"("uuid");
CREATE UNIQUE INDEX "yusuf_projects_key_key" ON "yusuf_projects"("key");
CREATE INDEX "yusuf_projects_status_idx" ON "yusuf_projects"("status");
CREATE UNIQUE INDEX "yusuf_project_policy_overrides_projectId_capabilityKey_key" ON "yusuf_project_policy_overrides"("projectId", "capabilityKey");
CREATE INDEX "yusuf_project_policy_overrides_projectId_enabled_idx" ON "yusuf_project_policy_overrides"("projectId", "enabled");
CREATE UNIQUE INDEX "yusuf_tasks_uuid_key" ON "yusuf_tasks"("uuid");
CREATE INDEX "yusuf_tasks_status_priority_updatedAt_idx" ON "yusuf_tasks"("status", "priority", "updatedAt");
CREATE INDEX "yusuf_tasks_assignedAgentId_status_idx" ON "yusuf_tasks"("assignedAgentId", "status");
CREATE INDEX "yusuf_tasks_projectId_status_idx" ON "yusuf_tasks"("projectId", "status");
CREATE INDEX "yusuf_tasks_parentTaskId_idx" ON "yusuf_tasks"("parentTaskId");
CREATE INDEX "yusuf_tasks_requestId_idx" ON "yusuf_tasks"("requestId");
CREATE UNIQUE INDEX "yusuf_task_dependencies_taskId_dependsOnTaskId_key" ON "yusuf_task_dependencies"("taskId", "dependsOnTaskId");
CREATE INDEX "yusuf_task_dependencies_dependsOnTaskId_idx" ON "yusuf_task_dependencies"("dependsOnTaskId");
CREATE UNIQUE INDEX "yusuf_agent_runs_uuid_key" ON "yusuf_agent_runs"("uuid");
CREATE INDEX "yusuf_agent_runs_taskId_status_idx" ON "yusuf_agent_runs"("taskId", "status");
CREATE INDEX "yusuf_agent_runs_agentId_status_idx" ON "yusuf_agent_runs"("agentId", "status");
CREATE INDEX "yusuf_agent_runs_requestId_idx" ON "yusuf_agent_runs"("requestId");
CREATE UNIQUE INDEX "yusuf_agent_capabilities_agentId_capabilityKey_key" ON "yusuf_agent_capabilities"("agentId", "capabilityKey");
CREATE INDEX "yusuf_agent_capabilities_agentId_enabled_idx" ON "yusuf_agent_capabilities"("agentId", "enabled");
CREATE UNIQUE INDEX "yusuf_action_intents_uuid_key" ON "yusuf_action_intents"("uuid");
CREATE INDEX "yusuf_action_intents_runId_status_idx" ON "yusuf_action_intents"("runId", "status");
CREATE INDEX "yusuf_action_intents_taskId_status_idx" ON "yusuf_action_intents"("taskId", "status");
CREATE INDEX "yusuf_action_intents_agentId_status_idx" ON "yusuf_action_intents"("agentId", "status");
CREATE UNIQUE INDEX "yusuf_action_intents_intentFingerprint_key" ON "yusuf_action_intents"("intentFingerprint");
CREATE INDEX "yusuf_action_intents_requestId_idx" ON "yusuf_action_intents"("requestId");
CREATE UNIQUE INDEX "yusuf_policy_decisions_uuid_key" ON "yusuf_policy_decisions"("uuid");
CREATE UNIQUE INDEX "yusuf_policy_decisions_intentId_decisionVersion_key" ON "yusuf_policy_decisions"("intentId", "decisionVersion");
CREATE INDEX "yusuf_policy_decisions_intentId_decidedAt_idx" ON "yusuf_policy_decisions"("intentId", "decidedAt");
CREATE INDEX "yusuf_policy_decisions_outcome_riskLevel_idx" ON "yusuf_policy_decisions"("outcome", "riskLevel");
CREATE INDEX "yusuf_policy_decisions_requestId_idx" ON "yusuf_policy_decisions"("requestId");
CREATE UNIQUE INDEX "yusuf_approval_requests_uuid_key" ON "yusuf_approval_requests"("uuid");
CREATE UNIQUE INDEX "yusuf_approval_requests_intentId_key" ON "yusuf_approval_requests"("intentId");
CREATE INDEX "yusuf_approval_requests_status_requestedAt_idx" ON "yusuf_approval_requests"("status", "requestedAt");
CREATE INDEX "yusuf_approval_requests_requestId_idx" ON "yusuf_approval_requests"("requestId");
CREATE UNIQUE INDEX "yusuf_action_receipts_uuid_key" ON "yusuf_action_receipts"("uuid");
CREATE UNIQUE INDEX "yusuf_action_receipts_intentId_key" ON "yusuf_action_receipts"("intentId");
CREATE UNIQUE INDEX "yusuf_action_receipts_executionKey_key" ON "yusuf_action_receipts"("executionKey");
CREATE INDEX "yusuf_action_receipts_outcome_verificationStatus_idx" ON "yusuf_action_receipts"("outcome", "verificationStatus");
CREATE INDEX "yusuf_action_receipts_requestId_idx" ON "yusuf_action_receipts"("requestId");
CREATE UNIQUE INDEX "yusuf_audit_events_uuid_key" ON "yusuf_audit_events"("uuid");
CREATE UNIQUE INDEX "yusuf_audit_events_sequence_key" ON "yusuf_audit_events"("sequence");
CREATE UNIQUE INDEX "yusuf_audit_events_eventHash_key" ON "yusuf_audit_events"("eventHash");
CREATE INDEX "yusuf_audit_events_occurredAt_id_idx" ON "yusuf_audit_events"("occurredAt", "id");
CREATE INDEX "yusuf_audit_events_intentRef_sequence_idx" ON "yusuf_audit_events"("intentRef", "sequence");
CREATE INDEX "yusuf_audit_events_taskRef_sequence_idx" ON "yusuf_audit_events"("taskRef", "sequence");
CREATE INDEX "yusuf_audit_events_requestId_idx" ON "yusuf_audit_events"("requestId");
CREATE UNIQUE INDEX "yusuf_security_settings_key_key" ON "yusuf_security_settings"("key");
CREATE UNIQUE INDEX "yusuf_audit_checkpoints_key_key" ON "yusuf_audit_checkpoints"("key");
