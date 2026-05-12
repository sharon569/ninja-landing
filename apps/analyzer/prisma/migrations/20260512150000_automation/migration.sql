-- Phase 10: Automation + Cron

-- 1. Per-client automation toggles
ALTER TABLE "Client"
    ADD COLUMN IF NOT EXISTS "status"                          TEXT NOT NULL DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS "automationEnabled"               BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS "autoGscSyncEnabled"              BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS "autoTechAuditEnabled"            BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS "autoOpportunityAnalysisEnabled"  BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS "autoImpactReviewEnabled"         BOOLEAN NOT NULL DEFAULT true;

-- 2. AutomationRun
CREATE TABLE IF NOT EXISTS "AutomationRun" (
    "id"            TEXT NOT NULL,
    "runType"       TEXT NOT NULL,
    "clientId"      TEXT,
    "status"        TEXT NOT NULL DEFAULT 'running',
    "triggeredBy"   TEXT,
    "parentRunId"   TEXT,
    "startedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt"    TIMESTAMP(3),
    "durationMs"    INTEGER,
    "summary"       TEXT,
    "error"         TEXT,
    "skippedReason" TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AutomationRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AutomationRun_clientId_startedAt_idx"
    ON "AutomationRun"("clientId", "startedAt" DESC);
CREATE INDEX IF NOT EXISTS "AutomationRun_runType_startedAt_idx"
    ON "AutomationRun"("runType", "startedAt" DESC);
CREATE INDEX IF NOT EXISTS "AutomationRun_status_startedAt_idx"
    ON "AutomationRun"("status", "startedAt" DESC);
CREATE INDEX IF NOT EXISTS "AutomationRun_parentRunId_idx"
    ON "AutomationRun"("parentRunId");

ALTER TABLE "AutomationRun"
    ADD CONSTRAINT "AutomationRun_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
