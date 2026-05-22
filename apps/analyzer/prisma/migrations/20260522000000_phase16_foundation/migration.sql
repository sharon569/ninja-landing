-- Phase 16: Foundation — Durable job queue + bot notification audit trail

-- PipelineRun: durable job queue with per-client locking
CREATE TABLE "analyzer"."PipelineRun" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "triggeredBy" TEXT NOT NULL,
    "payload" TEXT,
    "result" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "PipelineRun_pkey" PRIMARY KEY ("id")
);

-- BotNotification: audit trail for operator notifications
CREATE TABLE "analyzer"."BotNotification" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "messageId" TEXT,
    "type" TEXT NOT NULL,
    "clientId" TEXT,
    "referenceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BotNotification_pkey" PRIMARY KEY ("id")
);

-- Indexes for PipelineRun
CREATE INDEX "PipelineRun_status_createdAt_idx" ON "analyzer"."PipelineRun"("status", "createdAt");
CREATE INDEX "PipelineRun_clientId_type_status_idx" ON "analyzer"."PipelineRun"("clientId", "type", "status");

-- Indexes for BotNotification
CREATE INDEX "BotNotification_chatId_type_idx" ON "analyzer"."BotNotification"("chatId", "type");
CREATE INDEX "BotNotification_clientId_sentAt_idx" ON "analyzer"."BotNotification"("clientId", "sentAt" DESC);

-- Foreign keys
ALTER TABLE "analyzer"."PipelineRun" ADD CONSTRAINT "PipelineRun_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "analyzer"."Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "analyzer"."BotNotification" ADD CONSTRAINT "BotNotification_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "analyzer"."Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
