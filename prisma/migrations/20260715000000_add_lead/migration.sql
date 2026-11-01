-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'NOTIFIED', 'CONTACTED', 'CONVERTED', 'LOST');

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "vehicles" JSONB NOT NULL,
    "financing" JSONB,
    "tradeIn" JSONB,
    "profile" JSONB,
    "summary" TEXT NOT NULL,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Lead_sessionId_idx" ON "Lead"("sessionId");

-- CreateIndex
CREATE INDEX "Lead_status_createdAt_idx" ON "Lead"("status", "createdAt");
