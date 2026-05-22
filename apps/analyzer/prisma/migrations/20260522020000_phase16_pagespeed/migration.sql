-- Phase 16.6: PageSpeed history

CREATE TABLE "analyzer"."PageSpeedScore" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "pageUrl" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "performanceScore" DOUBLE PRECISION NOT NULL,
    "lcp" DOUBLE PRECISION,
    "inp" DOUBLE PRECISION,
    "cls" DOUBLE PRECISION,
    "fcp" DOUBLE PRECISION,
    "ttfb" DOUBLE PRECISION,
    "speedIndex" DOUBLE PRECISION,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageSpeedScore_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PageSpeedScore_clientId_fetchedAt_idx" ON "analyzer"."PageSpeedScore"("clientId", "fetchedAt" DESC);
CREATE INDEX "PageSpeedScore_clientId_pageUrl_idx" ON "analyzer"."PageSpeedScore"("clientId", "pageUrl");

ALTER TABLE "analyzer"."PageSpeedScore" ADD CONSTRAINT "PageSpeedScore_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "analyzer"."Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
