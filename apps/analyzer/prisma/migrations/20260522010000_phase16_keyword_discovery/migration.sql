-- Phase 16.2: Keyword Discovery — high-value GSC queries not in the keyword bank

CREATE TABLE "analyzer"."KeywordSuggestion" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "normalizedQuery" TEXT NOT NULL,
    "page" TEXT,
    "clicks28d" INTEGER NOT NULL DEFAULT 0,
    "impressions28d" INTEGER NOT NULL DEFAULT 0,
    "ctr" DOUBLE PRECISION,
    "position" DOUBLE PRECISION,
    "trend" TEXT,
    "score" INTEGER NOT NULL DEFAULT 0,
    "intent" TEXT,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'suggested',
    "convertedKeywordId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KeywordSuggestion_pkey" PRIMARY KEY ("id")
);

-- Unique constraint for deduplication
CREATE UNIQUE INDEX "KeywordSuggestion_clientId_normalizedQuery_key" ON "analyzer"."KeywordSuggestion"("clientId", "normalizedQuery");

-- Index for listing suggestions by score
CREATE INDEX "KeywordSuggestion_clientId_status_score_idx" ON "analyzer"."KeywordSuggestion"("clientId", "status", "score" DESC);

-- Foreign key
ALTER TABLE "analyzer"."KeywordSuggestion" ADD CONSTRAINT "KeywordSuggestion_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "analyzer"."Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
