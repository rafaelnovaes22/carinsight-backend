import { Controller, Post, Body, Param, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ChatService, ChatResponse } from './chat.service';

class StartChatDto {
    vehicleId: string;
    userId?: string;
    metadata?: Record<string, unknown>;
}

class SendMessageDto {
    content: string;
}

@ApiTags('Chat')
@Controller('api/chat')
export class ChatController {
    constructor(private readonly chatService: ChatService) { }

    /**
     * Start a new chat session with vehicle context
     * Triggered by "Conversar com vendedor" button on frontend
     */
    @Post('start')
    @ApiOperation({ summary: 'Start contextual chat with vehicle' })
    @ApiResponse({
        status: 201,
        description: 'Chat session created with greeting',
    })
    async startChat(@Body() dto: StartChatDto) {
        return this.chatService.startChat(dto);
    }

    /**
     * Send a message in an existing chat session
     */
    @Post(':sessionId/message')
    @ApiOperation({ summary: 'Send message in chat session' })
    @ApiResponse({
        status: 200,
        description: 'AI response with suggested actions',
    })
    async sendMessage(
        @Param('sessionId') sessionId: string,
        @Body() dto: SendMessageDto,
    ) {
        return this.chatService.sendMessage(sessionId, dto);
    }
}
