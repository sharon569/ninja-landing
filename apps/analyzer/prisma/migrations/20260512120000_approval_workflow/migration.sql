-- Phase 4: Approval Workflow + Impact Review

-- 1. Extra columns on Opportunity
ALTER TABLE "Opportunity"
    ADD COLUMN IF NOT EXISTS "approvedAt"          TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "approvedBy"          TEXT,
    ADD COLUMN IF NOT EXISTS "approvalNote"        TEXT,
    ADD COLUMN IF NOT EXISTS "approvedActionType"  TEXT,
    ADD COLUMN IF NOT EXISTS "rejectedAt"          TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "rejectedBy"          TEXT,
    ADD COLUMN IF NOT EXISTS "manuallyAppliedAt"   TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "manuallyAppliedBy"   TEXT,
    ADD COLUMN IF NOT EXISTS "manualActionNote"    TEXT,
    ADD COLUMN IF NOT EXISTS "manualActionUrl"     TEXT,
    ADD COLUMN IF NOT EXISTS "monitoringStartedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "impactReviewedAt"    TIMESTAMP(3);

-- 2. OpportunityActionLog
CREATE TABLE IF NOT EXISTS "OpportunityActionLog" (
    "id"            TEXT NOT NULL,
    "clientId"      TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "actionType"    TEXT NOT NULL,
    "fromStatus"    TEXT,
    "toStatus"      TEXT,
    "note"          TEXT,
    "createdBy"     TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OpportunityActionLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "OpportunityActionLog_opportunityId_createdAt_idx"
    ON "OpportunityActionLog"("opportunityId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "OpportunityActionLog_clientId_createdAt_idx"
    ON "OpportunityActionLog"("clientId", "createdAt" DESC);
ALTER TABLE "OpportunityActionLog"
    ADD CONSTRAINT "OpportunityActionLog_opportunityId_fkey"
    FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. ImpactBaseline
CREATE TABLE IF NOT EXISTS "ImpactBaseline" (
    "id"                TEXT NOT NULL,
    "clientId"          TEXT NOT NULL,
    "opportunityId"     TEXT NOT NULL,
    "relatedKeyword"    TEXT,
    "relatedQuery"      TEXT,
    "relatedPage"       TEXT,
    "baselineStartDate" TEXT NOT NULL,
    "baselineEndDate"   TEXT NOT NULL,
    "clicks"            INTEGER NOT NULL,
    "impressions"       INTEGER NOT NULL,
    "ctr"               DOUBLE PRECISION NOT NULL,
    "position"          DOUBLE PRECISION NOT NULL,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImpactBaseline_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ImpactBaseline_opportunityId_key"
    ON "ImpactBaseline"("opportunityId");
ALTER TABLE "ImpactBaseline"
    ADD CONSTRAINT "ImpactBaseline_opportunityId_fkey"
    FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. ImpactReview
CREATE TABLE IF NOT EXISTS "ImpactReview" (
    "id"                TEXT NOT NULL,
    "clientId"          TEXT NOT NULL,
    "opportunityId"     TEXT NOT NULL,
    "reviewWindow"      TEXT NOT NULL,
    "reviewDate"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clicksBefore"      INTEGER NOT NULL,
    "clicksAfter"       INTEGER NOT NULL,
    "impressionsBefore" INTEGER NOT NULL,
    "impressionsAfter"  INTEGER NOT NULL,
    "ctrBefore"         DOUBLE PRECISION NOT NULL,
    "ctrAfter"          DOUBLE PRECISION NOT NULL,
    "positionBefore"    DOUBLE PRECISION NOT NULL,
    "positionAfter"     DOUBLE PRECISION NOT NULL,
    "result"            TEXT NOT NULL,
    "summary"           TEXT NOT NULL,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImpactReview_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ImpactReview_opportunityId_reviewWindow_key"
    ON "ImpactReview"("opportunityId", "reviewWindow");
CREATE INDEX IF NOT EXISTS "ImpactReview_clientId_reviewDate_idx"
    ON "ImpactReview"("clientId", "reviewDate" DESC);
ALTER TABLE "ImpactReview"
    ADD CONSTRAINT "ImpactReview_opportunityId_fkey"
    FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
