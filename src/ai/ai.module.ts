import { Module } from '@nestjs/common';
import { LlmRouterService } from './llm/llm-router.service';
import { EmbeddingService } from './embeddings/embedding.service';
import { VectorSearchService } from './vector/vector-search.service';
import { ConversationGraphService } from './graph/conversation-graph.service';
import { ChatService } from './chat/chat.service';
import { ChatController } from './chat/chat.controller';
import { SearchController } from './search/search.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ChatController, SearchController],
  providers: [
    LlmRouterService,
    EmbeddingService,
    VectorSearchService,
    ConversationGraphService,
    ChatService,
  ],
  exports: [
    LlmRouterService,
    EmbeddingService,
    VectorSearchService,
    ConversationGraphService,
    ChatService,
  ],
})
export class AiModule {}
