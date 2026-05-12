-- Phase 5: Content Brief Generator

CREATE TABLE IF NOT EXISTS "ContentBrief" (
    "id"                          TEXT NOT NULL,
    "clientId"                    TEXT NOT NULL,
    "opportunityId"               TEXT,
    "targetKeyword"               TEXT NOT NULL,
    "relatedQuery"                TEXT,
    "relatedPage"                 TEXT,
    "briefType"                   TEXT NOT NULL,
    "searchIntent"                TEXT NOT NULL DEFAULT 'unknown',
    "recommendedTitle"            TEXT,
    "recommendedMetaDescription"  TEXT,
    "recommendedH1"               TEXT,
    "outline"                     TEXT,
    "secondaryKeywords"           TEXT[] NOT NULL DEFAULT '{}'::text[],
    "internalLinks"               TEXT[] NOT NULL DEFAULT '{}'::text[],
    "recommendedCTA"              TEXT,
    "recommendedSchema"           TEXT,
    "contentAngle"                TEXT,
    "notes"                       TEXT,
    "status"                      TEXT NOT NULL DEFAULT 'draft',
    "createdAt"                   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"                   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ContentBrief_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS
    "ContentBrief_clientId_opportunityId_briefType_key"
    ON "ContentBrief"("clientId", "opportunityId", "briefType");

CREATE INDEX IF NOT EXISTS "ContentBrief_clientId_status_idx"
    ON "ContentBrief"("clientId", "status");

CREATE INDEX IF NOT EXISTS "ContentBrief_clientId_briefType_idx"
    ON "ContentBrief"("clientId", "briefType");

ALTER TABLE "ContentBrief"
    ADD CONSTRAINT "ContentBrief_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContentBrief"
    ADD CONSTRAINT "ContentBrief_opportunityId_fkey"
    FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
