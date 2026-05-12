-- Phase 3: SEO Opportunity Engine
-- 1. Add page-dimension indexes to GscDailyRow.
-- 2. Create Opportunity table with compound dedupe key.

-- 1. GscDailyRow new indexes (page dimension already exists, just unindexed)
CREATE INDEX IF NOT EXISTS "GscDailyRow_clientId_page_idx"
    ON "GscDailyRow"("clientId", "page");

CREATE INDEX IF NOT EXISTS "GscDailyRow_clientId_query_page_idx"
    ON "GscDailyRow"("clientId", "query", "page");

-- 2. Opportunity table
CREATE TABLE IF NOT EXISTS "Opportunity" (
    "id"                TEXT NOT NULL,
    "clientId"          TEXT NOT NULL,
    "type"              TEXT NOT NULL,
    "title"             TEXT NOT NULL,
    "description"       TEXT NOT NULL,
    "evidence"          TEXT NOT NULL,
    "recommendedAction" TEXT NOT NULL,
    "priorityScore"     INTEGER NOT NULL DEFAULT 0,
    "impact"            TEXT NOT NULL DEFAULT 'medium',
    "effort"            TEXT NOT NULL DEFAULT 'medium',
    "confidence"        TEXT NOT NULL DEFAULT 'medium',
    "status"            TEXT NOT NULL DEFAULT 'detected',
    "relatedKeyword"    TEXT NOT NULL DEFAULT '',
    "relatedPage"       TEXT NOT NULL DEFAULT '',
    "relatedQuery"      TEXT NOT NULL DEFAULT '',
    "source"            TEXT,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL,
    "detectedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS
    "Opportunity_clientId_type_relatedKeyword_relatedPage_relatedQuery_key"
    ON "Opportunity"("clientId", "type", "relatedKeyword", "relatedPage", "relatedQuery");

CREATE INDEX IF NOT EXISTS "Opportunity_clientId_status_idx"
    ON "Opportunity"("clientId", "status");

CREATE INDEX IF NOT EXISTS "Opportunity_clientId_priorityScore_idx"
    ON "Opportunity"("clientId", "priorityScore" DESC);

ALTER TABLE "Opportunity"
    ADD CONSTRAINT "Opportunity_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
