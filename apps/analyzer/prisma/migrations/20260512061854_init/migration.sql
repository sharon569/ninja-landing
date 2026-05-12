-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastInfo" TEXT,
    "lastInfoAt" TIMESTAMP(3),
    "lastScanAt" TIMESTAMP(3),

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GscConnection" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "googleEmail" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "accessToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "propertyUrl" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GscConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GscDailyRow" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "page" TEXT,
    "clicks" INTEGER NOT NULL,
    "impressions" INTEGER NOT NULL,
    "ctr" DOUBLE PRECISION NOT NULL,
    "position" DOUBLE PRECISION NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GscDailyRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scan" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "ranAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "filePath" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,

    CONSTRAINT "Scan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Finding" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "payload" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Finding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Client_baseUrl_key" ON "Client"("baseUrl");

-- CreateIndex
CREATE INDEX "Client_baseUrl_idx" ON "Client"("baseUrl");

-- CreateIndex
CREATE UNIQUE INDEX "GscConnection_clientId_key" ON "GscConnection"("clientId");

-- CreateIndex
CREATE INDEX "GscDailyRow_clientId_date_idx" ON "GscDailyRow"("clientId", "date");

-- CreateIndex
CREATE INDEX "GscDailyRow_clientId_query_idx" ON "GscDailyRow"("clientId", "query");

-- CreateIndex
CREATE UNIQUE INDEX "GscDailyRow_clientId_date_query_page_key" ON "GscDailyRow"("clientId", "date", "query", "page");

-- CreateIndex
CREATE INDEX "Scan_clientId_ranAt_idx" ON "Scan"("clientId", "ranAt");

-- CreateIndex
CREATE INDEX "Finding_scanId_severity_idx" ON "Finding"("scanId", "severity");

-- CreateIndex
CREATE INDEX "Finding_ruleId_idx" ON "Finding"("ruleId");

-- AddForeignKey
ALTER TABLE "GscConnection" ADD CONSTRAINT "GscConnection_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GscDailyRow" ADD CONSTRAINT "GscDailyRow_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scan" ADD CONSTRAINT "Scan_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
