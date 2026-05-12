-- Phase 14D — Keyword Strategy Planner.
-- Per-keyword strategic plan with Why-per-step action roadmap, opportunity
-- score, and measurement plan. The strategy never executes anything — it's
-- the layer that decides what should happen and in what order, then links
-- to Opportunities / Briefs / Internal Links / Execution for the operator
-- to act on each step manually.

CREATE TABLE "analyzer"."KeywordStrategy" (
    "id"                  TEXT PRIMARY KEY,
    "clientId"            TEXT NOT NULL,
    "targetKeywordId"     TEXT NOT NULL,
    "keyword"             TEXT NOT NULL,
    "status"              TEXT NOT NULL DEFAULT 'draft',
    "strategyType"        TEXT NOT NULL,
    "riskLevel"           TEXT NOT NULL,
    "confidence"          TEXT NOT NULL,
    "opportunityScore"    INTEGER NOT NULL DEFAULT 0,
    "rankingPage"         TEXT,
    "currentPosition"     DOUBLE PRECISION,
    "currentClicks"       INTEGER,
    "currentImpressions"  INTEGER,
    "currentCtr"          DOUBLE PRECISION,
    "trend"               TEXT,
    "targetPageMismatch"  BOOLEAN NOT NULL DEFAULT false,
    "summary"             TEXT NOT NULL,
    "payload"             TEXT NOT NULL,
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3) NOT NULL,
    "approvedAt"          TIMESTAMP(3),
    "approvedBy"          TEXT,
    "approvalNote"        TEXT,
    "pausedAt"            TIMESTAMP(3),
    "completedAt"         TIMESTAMP(3)
);

ALTER TABLE "analyzer"."KeywordStrategy"
    ADD CONSTRAINT "KeywordStrategy_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "analyzer"."Client"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "analyzer"."KeywordStrategy"
    ADD CONSTRAINT "KeywordStrategy_targetKeywordId_fkey"
    FOREIGN KEY ("targetKeywordId") REFERENCES "analyzer"."TargetKeyword"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "KeywordStrategy_clientId_status_idx"
    ON "analyzer"."KeywordStrategy"("clientId", "status");
CREATE INDEX "KeywordStrategy_clientId_strategyType_idx"
    ON "analyzer"."KeywordStrategy"("clientId", "strategyType");
CREATE INDEX "KeywordStrategy_clientId_opportunityScore_idx"
    ON "analyzer"."KeywordStrategy"("clientId", "opportunityScore" DESC);
CREATE INDEX "KeywordStrategy_targetKeywordId_idx"
    ON "analyzer"."KeywordStrategy"("targetKeywordId");
