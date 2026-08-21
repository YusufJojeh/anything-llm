ALTER TABLE "yusuf_agent_runs" ADD COLUMN "reasoningState" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "yusuf_agent_runs" ADD COLUMN "reasoningLeaseId" TEXT;
ALTER TABLE "yusuf_agent_runs" ADD COLUMN "reasoningLeaseExpiresAt" DATETIME;
ALTER TABLE "yusuf_agent_runs" ADD COLUMN "reviewDecisionDigest" TEXT;

CREATE INDEX "yusuf_agent_runs_reasoningLeaseExpiresAt_idx"
ON "yusuf_agent_runs"("reasoningLeaseExpiresAt");
