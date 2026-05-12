-- Phase 12 — per-client Execution gates. Pilot Mode + allowlist let the
-- agency safely turn on Execution one client at a time. Defaults err on the
-- side of "off" so existing rows cannot execute until Sharon opts them in.

ALTER TABLE "analyzer"."Client"
    ADD COLUMN "executionEnabled" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "executionPilotMode" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "allowedExecutionActions" TEXT[] NOT NULL DEFAULT '{}'::TEXT[];
