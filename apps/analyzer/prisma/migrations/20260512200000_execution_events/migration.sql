-- Phase 13 — ExecutionEvent telemetry feed. Append-only observability for
-- the Execution Engine. Used for the UI feed and to drive Slack/email
-- alerts. The engine itself never reads back from this table.

CREATE TABLE "analyzer"."ExecutionEvent" (
    "id"                  TEXT PRIMARY KEY,
    "clientId"            TEXT NOT NULL,
    "executionActionId"   TEXT,
    "eventType"           TEXT NOT NULL,
    "severity"            TEXT NOT NULL DEFAULT 'info',
    "title"               TEXT NOT NULL,
    "message"             TEXT,
    "metadata"            TEXT,
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifiedAt"          TIMESTAMP(3),
    "notificationStatus"  TEXT,
    "notificationChannel" TEXT
);

ALTER TABLE "analyzer"."ExecutionEvent"
    ADD CONSTRAINT "ExecutionEvent_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "analyzer"."Client"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "analyzer"."ExecutionEvent"
    ADD CONSTRAINT "ExecutionEvent_executionActionId_fkey"
    FOREIGN KEY ("executionActionId") REFERENCES "analyzer"."ExecutionAction"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ExecutionEvent_clientId_createdAt_idx"
    ON "analyzer"."ExecutionEvent"("clientId", "createdAt" DESC);
CREATE INDEX "ExecutionEvent_eventType_createdAt_idx"
    ON "analyzer"."ExecutionEvent"("eventType", "createdAt" DESC);
CREATE INDEX "ExecutionEvent_executionActionId_idx"
    ON "analyzer"."ExecutionEvent"("executionActionId");
CREATE INDEX "ExecutionEvent_severity_createdAt_idx"
    ON "analyzer"."ExecutionEvent"("severity", "createdAt" DESC);
