ALTER TABLE "yusuf_schedules" ADD COLUMN "workerLastTickAt" DATETIME;
ALTER TABLE "yusuf_schedules" ADD COLUMN "workerLastFailureAt" DATETIME;
ALTER TABLE "yusuf_schedules" ADD COLUMN "workerLastErrorCode" TEXT;
