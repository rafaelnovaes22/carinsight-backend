import { Module } from '@nestjs/common';
import { LlmRouterService } from './llm/llm-router.service';
import { PreferenceExtractorService } from './llm/preference-extractor.service';
import { EmbeddingService } from './embeddings/embedding.service';
import { VectorSearchService } from './vector/vector-search.service';
import { ConversationGraphService } from './graph/conversation-graph.service';
import { LeadService } from './lead/lead.service';
import { LeadNotificationService } from './lead/lead-notification.service';
import { ChatService } from './chat/chat.service';
import { ChatController } from './chat/chat.controller';
import { SearchController } from './search/search.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ChatController, SearchController],
  providers: [
    LlmRouterService,
    PreferenceExtractorService,
    EmbeddingService,
    VectorSearchService,
    ConversationGraphService,
    LeadService,
    LeadNotificationService,
    ChatService,
  ],
  exports: [
    LlmRouterService,
    PreferenceExtractorService,
    EmbeddingService,
    VectorSearchService,
    ConversationGraphService,
    LeadService,
    ChatService,
  ],
})
export class AiModule {}
