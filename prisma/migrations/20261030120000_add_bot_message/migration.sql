-- Tabela de ingestão das conversas do bot externo (Telegram) para o
-- relatório de inteligência do lojista (POST /analytics/ingest).
CREATE TABLE "BotMessage" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "userName" TEXT,
    "userText" TEXT,
    "botText" TEXT,
    "meta" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BotMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BotMessage_platform_chatId_occurredAt_idx" ON "BotMessage"("platform", "chatId", "occurredAt");

-- CreateIndex
CREATE INDEX "BotMessage_occurredAt_idx" ON "BotMessage"("occurredAt");
