-- Phase 15E.1 — Keyword Goals + Master Page manual override.
-- Adds operator-set strategic goal fields to TargetKeyword and tracks when
-- the resolver was overridden manually. All fields nullable / default — no
-- backfill required, no breaking change to existing rows.

ALTER TABLE "analyzer"."TargetKeyword"
    ADD COLUMN IF NOT EXISTS "keywordGoal"              TEXT,
    ADD COLUMN IF NOT EXISTS "keywordGoalNote"          TEXT,
    ADD COLUMN IF NOT EXISTS "keywordGoalSetAt"         TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "keywordGoalSetBy"         TEXT,
    ADD COLUMN IF NOT EXISTS "masterPageManualOverride" BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS "masterPageOverrideAt"     TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "masterPageOverrideBy"     TEXT;
