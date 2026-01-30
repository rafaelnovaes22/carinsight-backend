import { Controller, Post, Body, Param, Get, Delete, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody } from '@nestjs/swagger';
import { ChatService, ChatResponse } from './chat.service';
import { Public } from '../../auth/decorators/public.decorator';

class StartChatDto {
  vehicleId?: string;
  userId?: string;
  phoneNumber?: string;
  metadata?: Record<string, unknown>;
}

class SendMessageDto {
  content: string;
}

@ApiTags('Chat')
@Controller('api/chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /**
   * Start a new chat session
   * Can be contextual (with vehicle) or general conversation
   */
  @Post('start')
  @Public()
  @ApiOperation({ summary: 'Start a new chat session' })
  @ApiBody({ type: StartChatDto })
  @ApiResponse({
    status: 201,
    description: 'Chat session created with greeting',
    schema: {
      properties: {
        sessionId: { type: 'string', example: 'uuid-session-id' },
        greeting: { type: 'string', example: 'Olá! Sou a assistente virtual do CarInsight...' },
      },
    },
  })
  async startChat(@Body() dto: StartChatDto) {
    return this.chatService.startChat(dto);
  }

  /**
   * Send a message in an existing chat session
   * Uses LangGraph for intelligent conversation flow
   */
  @Post(':sessionId/message')
  @Public()
  @ApiOperation({ summary: 'Send message in chat session' })
  @ApiParam({ name: 'sessionId', description: 'Chat session ID' })
  @ApiBody({ type: SendMessageDto })
  @ApiResponse({
    status: 200,
    description: 'AI response with suggested actions',
    schema: {
      properties: {
        response: { type: 'string' },
        suggestedActions: { type: 'array', items: { type: 'string' } },
        recommendations: { type: 'array' },
        currentNode: { type: 'string' },
      },
    },
  })
  async sendMessage(
    @Param('sessionId') sessionId: string,
    @Body() dto: SendMessageDto,
  ): Promise<ChatResponse> {
    return this.chatService.sendMessage(sessionId, dto);
  }

  /**
   * Get conversation state (for debugging)
   */
  @Get(':sessionId/state')
  @ApiOperation({ summary: 'Get conversation state' })
  @ApiParam({ name: 'sessionId', description: 'Chat session ID' })
  @ApiResponse({
    status: 200,
    description: 'Current conversation state',
  })
  getConversationState(@Param('sessionId') sessionId: string) {
    const session = this.chatService.getConversationState(sessionId);
    if (!session) {
      return { error: 'Session not found' };
    }
    return {
      threadId: session.threadId,
      currentNode: session.state.next,
      profile: session.state.profile,
      recommendationsCount: session.state.recommendations.length,
      messageCount: session.state.messages.length,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }

  /**
   * Reset conversation
   */
  @Delete(':sessionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reset/delete conversation' })
  @ApiParam({ name: 'sessionId', description: 'Chat session ID' })
  @ApiResponse({
    status: 204,
    description: 'Conversation reset successfully',
  })
  resetConversation(@Param('sessionId') sessionId: string) {
    this.chatService.resetConversation(sessionId);
  }

  /**
   * Get chat stats
   */
  @Get('stats/active')
  @ApiOperation({ summary: 'Get active sessions count' })
  @ApiResponse({
    status: 200,
    description: 'Active sessions statistics',
    schema: {
      properties: {
        activeSessions: { type: 'number' },
      },
    },
  })
  getStats() {
    return {
      activeSessions: this.chatService.getActiveSessionsCount(),
    };
  }
}
