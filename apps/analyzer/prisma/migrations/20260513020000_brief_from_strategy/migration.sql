-- Phase 15B — link ContentBrief to a KeywordStrategy step.
-- Existing briefs (from Opportunity) stay untouched — sourceType defaults
-- to 'opportunity' so all prior rows keep their semantics.

ALTER TABLE "analyzer"."ContentBrief"
    ADD COLUMN "sourceType"        TEXT NOT NULL DEFAULT 'opportunity',
    ADD COLUMN "keywordStrategyId" TEXT,
    ADD COLUMN "strategyStepIndex" INTEGER,
    ADD COLUMN "strategyContext"   TEXT;

ALTER TABLE "analyzer"."ContentBrief"
    ADD CONSTRAINT "ContentBrief_keywordStrategyId_fkey"
    FOREIGN KEY ("keywordStrategyId") REFERENCES "analyzer"."KeywordStrategy"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ContentBrief_keywordStrategyId_idx"
    ON "analyzer"."ContentBrief"("keywordStrategyId");
