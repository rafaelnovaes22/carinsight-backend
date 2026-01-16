import { Injectable, Logger } from '@nestjs/common';

/**
 * Placeholder for LangGraph conversation service.
 * Will be implemented with full LangGraph nodes in a future phase.
 * For now, the ChatService handles basic conversation flow.
 */
@Injectable()
export class ConversationGraphService {
    private readonly logger = new Logger(ConversationGraphService.name);

    constructor() {
        this.logger.log('ConversationGraphService initialized (placeholder)');
    }

    /**
     * Process a message through the conversation graph.
     * Currently a placeholder - full LangGraph implementation coming soon.
     */
    async processMessage(
        threadId: string,
        message: string,
        context?: Record<string, unknown>,
    ): Promise<{ response: string; nextNode?: string }> {
        this.logger.log(`Processing message in thread: ${threadId}`);

        // Placeholder - ChatService handles the actual conversation for now
        return {
            response: 'Message processed via conversation graph',
            nextNode: 'negotiation',
        };
    }
}
