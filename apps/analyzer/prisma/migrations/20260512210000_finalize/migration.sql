-- Phase 14B — manual "no rollback needed" finalize marker.
-- Used to close out an executed/rollback_available ExecutionAction without
-- touching WordPress. The transition is internal to the Analyzer.

ALTER TABLE "analyzer"."ExecutionAction"
    ADD COLUMN "finalizedAt" TIMESTAMP(3),
    ADD COLUMN "finalizedBy" TEXT;
