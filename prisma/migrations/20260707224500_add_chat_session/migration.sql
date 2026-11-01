-- CreateTable
CREATE TABLE "ChatSession" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatSession_threadId_key" ON "ChatSession"("threadId");
