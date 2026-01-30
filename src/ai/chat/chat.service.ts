import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ConversationGraphService,
  ConversationSession,
} from '../graph/conversation-graph.service';
import { VectorSearchService } from '../vector/vector-search.service';
import { v4 as uuidv4 } from 'uuid';

interface StartChatDto {
  vehicleId?: string;
  userId?: string;
  phoneNumber?: string;
  metadata?: Record<string, unknown>;
}

interface SendMessageDto {
  content: string;
}

export interface ChatResponse {
  response: string;
  suggestedActions?: string[];
  recommendations?: any[];
  currentNode?: string;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private prisma: PrismaService,
    private conversationGraph: ConversationGraphService,
    private vectorSearch: VectorSearchService,
  ) {}

  /**
   * Start a new chat session
   * Can be contextual (with vehicle) or general conversation
   */
  async startChat(dto: StartChatDto): Promise<{
    sessionId: string;
    greeting: string;
    vehicle?: {
      id: string;
      make: string;
      model: string;
      yearModel: number;
      price: number;
    };
  }> {
    const sessionId = uuidv4();
    this.logger.log(`Starting chat session: ${sessionId}`);

    let vehicleContext = '';
    let vehicleData: any = null;

    // If vehicle context provided, get vehicle details and set as lead context
    if (dto.vehicleId) {
      const vehicle = await this.vectorSearch.getVehicleById(dto.vehicleId);
      if (vehicle) {
        vehicleData = {
          id: vehicle.id,
          make: vehicle.make,
          model: vehicle.model,
          yearModel: vehicle.yearModel,
          price: Number(vehicle.price),
          mileage: vehicle.mileage,
          bodyType: vehicle.bodyType,
        };
        vehicleContext = `Estou interessado no ${vehicle.make} ${vehicle.model} ${vehicle.yearModel}`;
      }
    }

    // Process initial message through graph with vehicle context
    const initialMessage = vehicleContext || 'Olá';
    const result = await this.conversationGraph.processMessage(
      sessionId,
      initialMessage,
      {
        userId: dto.userId,
        phoneNumber: dto.phoneNumber,
        // Pass vehicle as initial interest for lead tracking
        interestedVehicle: vehicleData,
      },
    );

    // Record interaction if vehicle provided (creates the lead)
    if (dto.vehicleId) {
      await this.prisma.userInteraction.create({
        data: {
          vehicleId: dto.vehicleId,
          userId: dto.userId || null,
          type: 'CONTACTED',
          metadata: {
            source: 'web_chat',
            sessionId,
            startedAt: new Date().toISOString(),
            isLead: true,
            ...dto.metadata,
          },
        },
      });
      this.logger.log(
        `Lead created for vehicle ${dto.vehicleId} in session ${sessionId}`,
      );
    }

    return {
      sessionId,
      greeting: result.response,
      vehicle: vehicleData,
    };
  }

  /**
   * Process a message in an existing chat session
   * Uses LangGraph for conversation flow
   */
  async sendMessage(
    sessionId: string,
    dto: SendMessageDto,
  ): Promise<ChatResponse> {
    this.logger.log(`Processing message in session: ${sessionId}`);

    // Process through conversation graph
    const result = await this.conversationGraph.processMessage(
      sessionId,
      dto.content,
    );

    return {
      response: result.response,
      suggestedActions: result.suggestedActions,
      recommendations: result.recommendations,
      currentNode: result.currentNode,
    };
  }

  /**
   * Get conversation state (for debugging/admin)
   */
  getConversationState(sessionId: string): ConversationSession | undefined {
    return this.conversationGraph.getSession(sessionId);
  }

  /**
   * Reset conversation
   */
  resetConversation(sessionId: string): void {
    this.conversationGraph.clearSession(sessionId);
  }

  /**
   * Get active sessions count
   */
  getActiveSessionsCount(): number {
    return this.conversationGraph.getActiveSessionsCount();
  }
}
