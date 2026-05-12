-- Phase 6: Internal Linking Engine

CREATE TABLE IF NOT EXISTS "InternalLinkSuggestion" (
    "id"              TEXT NOT NULL,
    "clientId"        TEXT NOT NULL,
    "sourcePage"      TEXT NOT NULL,
    "sourceTitle"     TEXT,
    "targetPage"      TEXT NOT NULL,
    "targetTitle"     TEXT,
    "suggestedAnchor" TEXT NOT NULL,
    "reason"          TEXT NOT NULL,
    "evidence"        TEXT NOT NULL,
    "priorityScore"   INTEGER NOT NULL DEFAULT 0,
    "impact"          TEXT NOT NULL DEFAULT 'medium',
    "effort"          TEXT NOT NULL DEFAULT 'low',
    "confidence"      TEXT NOT NULL DEFAULT 'medium',
    "status"          TEXT NOT NULL DEFAULT 'suggested',
    "opportunityId"   TEXT,
    "source"          TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InternalLinkSuggestion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS
    "InternalLinkSuggestion_clientId_sourcePage_targetPage_suggestedAnchor_key"
    ON "InternalLinkSuggestion"("clientId", "sourcePage", "targetPage", "suggestedAnchor");

CREATE INDEX IF NOT EXISTS "InternalLinkSuggestion_clientId_status_idx"
    ON "InternalLinkSuggestion"("clientId", "status");

CREATE INDEX IF NOT EXISTS "InternalLinkSuggestion_clientId_priorityScore_idx"
    ON "InternalLinkSuggestion"("clientId", "priorityScore" DESC);

CREATE INDEX IF NOT EXISTS "InternalLinkSuggestion_clientId_targetPage_idx"
    ON "InternalLinkSuggestion"("clientId", "targetPage");

ALTER TABLE "InternalLinkSuggestion"
    ADD CONSTRAINT "InternalLinkSuggestion_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InternalLinkSuggestion"
    ADD CONSTRAINT "InternalLinkSuggestion_opportunityId_fkey"
    FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
