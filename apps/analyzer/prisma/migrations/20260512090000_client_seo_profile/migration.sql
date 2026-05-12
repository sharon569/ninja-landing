-- Phase 1: Client SEO Profile
-- Adds business-context, strategy, brand, and automation fields to analyzer.Client.
-- All columns are nullable or default-valued; existing rows remain valid.

ALTER TABLE "Client"
    ADD COLUMN IF NOT EXISTS "vertical"        TEXT,
    ADD COLUMN IF NOT EXISTS "language"        TEXT,
    ADD COLUMN IF NOT EXISTS "country"         TEXT,
    ADD COLUMN IF NOT EXISTS "serviceAreas"    TEXT[] NOT NULL DEFAULT '{}'::text[],
    ADD COLUMN IF NOT EXISTS "seoGoals"        TEXT,
    ADD COLUMN IF NOT EXISTS "targetPages"     TEXT[] NOT NULL DEFAULT '{}'::text[],
    ADD COLUMN IF NOT EXISTS "competitors"     TEXT[] NOT NULL DEFAULT '{}'::text[],
    ADD COLUMN IF NOT EXISTS "brandVoice"      TEXT,
    ADD COLUMN IF NOT EXISTS "notes"           TEXT,
    ADD COLUMN IF NOT EXISTS "automationLevel" TEXT NOT NULL DEFAULT 'balanced',
    ADD COLUMN IF NOT EXISTS "requireApprovalFor" TEXT[] NOT NULL DEFAULT ARRAY[
        'publish','title_change','meta_change','content_change',
        'internal_link','schema_change','wordpress_update'
    ]::text[];
