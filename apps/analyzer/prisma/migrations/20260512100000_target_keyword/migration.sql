-- Phase 2: TargetKeyword — per-client keyword bank.

CREATE TABLE IF NOT EXISTS "TargetKeyword" (
    "id"        TEXT NOT NULL,
    "clientId"  TEXT NOT NULL,
    "keyword"   TEXT NOT NULL,
    "intent"    TEXT,
    "priority"  TEXT NOT NULL DEFAULT 'medium',
    "targetUrl" TEXT,
    "status"    TEXT NOT NULL DEFAULT 'active',
    "notes"     TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TargetKeyword_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TargetKeyword_clientId_keyword_key"
    ON "TargetKeyword"("clientId", "keyword");

CREATE INDEX IF NOT EXISTS "TargetKeyword_clientId_status_idx"
    ON "TargetKeyword"("clientId", "status");

CREATE INDEX IF NOT EXISTS "TargetKeyword_clientId_priority_idx"
    ON "TargetKeyword"("clientId", "priority");

ALTER TABLE "TargetKeyword"
    ADD CONSTRAINT "TargetKeyword_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
