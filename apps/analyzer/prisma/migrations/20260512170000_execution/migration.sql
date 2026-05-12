-- Phase 11 — ExecutionAction table for the conservative Execution Engine.
-- Strictly draft → dry_run_ready → awaiting_execution_approval → executed.
-- No execution path skips dryRunAt + an explicit Execute click.

CREATE TABLE "analyzer"."ExecutionAction" (
    "id"              TEXT PRIMARY KEY,
    "clientId"        TEXT NOT NULL,
    "sourceType"      TEXT NOT NULL,
    "sourceId"        TEXT NOT NULL,
    "actionType"      TEXT NOT NULL,
    "status"          TEXT NOT NULL DEFAULT 'draft',
    "targetUrl"       TEXT,
    "targetPostId"    INTEGER,
    "payload"         TEXT NOT NULL,
    "dryRunResult"    TEXT,
    "diff"            TEXT,
    "executionResult" TEXT,
    "auditLogId"      INTEGER,
    "error"           TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,
    "dryRunAt"        TIMESTAMP(3),
    "executedAt"      TIMESTAMP(3),
    "executedBy"      TEXT,
    "cancelledAt"     TIMESTAMP(3),
    "rolledBackAt"    TIMESTAMP(3)
);

ALTER TABLE "analyzer"."ExecutionAction"
    ADD CONSTRAINT "ExecutionAction_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "analyzer"."Client"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "ExecutionAction_clientId_status_updatedAt_idx"
    ON "analyzer"."ExecutionAction"("clientId", "status", "updatedAt" DESC);
CREATE INDEX "ExecutionAction_sourceType_sourceId_idx"
    ON "analyzer"."ExecutionAction"("sourceType", "sourceId");
CREATE INDEX "ExecutionAction_clientId_actionType_idx"
    ON "analyzer"."ExecutionAction"("clientId", "actionType");
