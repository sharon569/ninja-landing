-- Phase 16.5: Content Calendar + publishing cadence

-- Add publishing cadence to Client
ALTER TABLE "analyzer"."Client" ADD COLUMN "publishingCadence" INTEGER NOT NULL DEFAULT 2;
ALTER TABLE "analyzer"."Client" ADD COLUMN "publishingDays" TEXT[] DEFAULT ARRAY['sunday','wednesday']::TEXT[];

-- Content schedule
CREATE TABLE "analyzer"."ContentSchedule" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "briefId" TEXT NOT NULL,
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "publishedAt" TIMESTAMP(3),
    "publishedBy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentSchedule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContentSchedule_briefId_key" ON "analyzer"."ContentSchedule"("briefId");
CREATE INDEX "ContentSchedule_clientId_scheduledDate_idx" ON "analyzer"."ContentSchedule"("clientId", "scheduledDate");
CREATE INDEX "ContentSchedule_clientId_status_idx" ON "analyzer"."ContentSchedule"("clientId", "status");

ALTER TABLE "analyzer"."ContentSchedule" ADD CONSTRAINT "ContentSchedule_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "analyzer"."Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "analyzer"."ContentSchedule" ADD CONSTRAINT "ContentSchedule_briefId_fkey" FOREIGN KEY ("briefId") REFERENCES "analyzer"."ContentBrief"("id") ON DELETE CASCADE ON UPDATE CASCADE;
