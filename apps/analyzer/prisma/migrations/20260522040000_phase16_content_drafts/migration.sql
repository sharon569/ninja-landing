-- Phase 16.4: AI Content Drafts

CREATE TABLE "analyzer"."ContentDraft" (
    "id" TEXT NOT NULL,
    "briefId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "model" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "wordCount" INTEGER NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "promptHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "feedback" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentDraft_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContentDraft_briefId_version_idx" ON "analyzer"."ContentDraft"("briefId", "version" DESC);

ALTER TABLE "analyzer"."ContentDraft" ADD CONSTRAINT "ContentDraft_briefId_fkey" FOREIGN KEY ("briefId") REFERENCES "analyzer"."ContentBrief"("id") ON DELETE CASCADE ON UPDATE CASCADE;
