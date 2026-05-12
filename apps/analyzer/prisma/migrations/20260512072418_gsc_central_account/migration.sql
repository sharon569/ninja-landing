/*
  Warnings:

  - You are about to drop the `GscConnection` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "GscConnection" DROP CONSTRAINT "GscConnection_clientId_fkey";

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "gscLastSyncAt" TIMESTAMP(3),
ADD COLUMN     "gscPropertyUrl" TEXT;

-- DropTable
DROP TABLE "GscConnection";

-- CreateTable
CREATE TABLE "GscAccount" (
    "id" TEXT NOT NULL,
    "googleEmail" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "accessToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GscAccount_pkey" PRIMARY KEY ("id")
);
