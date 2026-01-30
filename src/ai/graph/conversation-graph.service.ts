import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { HumanMessage } from '@langchain/core/messages';
import { Runnable } from '@langchain/core/runnables';
import { createConversationGraph, GraphStateType } from './workflow';
import { createInitialState, VehicleRecommendation, CustomerProfile, IGraphState } from './types/graph-state.types';
import { VectorSearchService } from '../vector/vector-search.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Conversation session stored in memory (can be extended to use Redis/DB)
 */
export interface ConversationSession {
  threadId: string;
  state: IGraphState;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Response from processing a message
 */
export interface ConversationResponse {
  response: string;
  sessionId: string;
  currentNode: string;
  recommendations?: VehicleRecommendation[];
  profile?: Partial<CustomerProfile>;
  suggestedActions?: string[];
}

@Injectable()
export class ConversationGraphService implements OnModuleInit {
  private readonly logger = new Logger(ConversationGraphService.name);
  private app: Runnable;
  private sessions: Map<string, ConversationSession> = new Map();

  constructor(
    private vectorSearch: VectorSearchService,
    private prisma: PrismaService,
  ) {}

  onModuleInit() {
    this.initializeGraph();
    this.logger.log('ConversationGraphService initialized with LangGraph');
  }

  /**
   * Initialize the LangGraph workflow with search integration
   */
  private initializeGraph(): void {
    this.app = createConversationGraph({
      searchNode: this.createSearchNode(),
    });
  }

  /**
   * Create search node that integrates with VectorSearchService
   */
  private createSearchNode() {
    return async (state: GraphStateType): Promise<Partial<GraphStateType>> => {
      this.logger.log('Executing search with profile:', JSON.stringify(state.profile));

      try {
        // Build search query from profile
        const query = this.buildSearchQuery(state.profile);
        
        // Build filters from profile
        const filters: any = {};
        if (state.profile.budget) {
          filters.priceMax = state.profile.budget * 1.1; // 10% flexibility
        }
        if (state.profile.minYear) {
          filters.yearMin = state.profile.minYear;
        }
        if (state.profile.bodyType) {
          filters.bodyType = state.profile.bodyType;
        }
        if (state.profile.brand) {
          filters.make = state.profile.brand;
        }

        // Execute semantic search
        const searchResults = await this.vectorSearch.searchSemantic(query, 5, filters);

        if (searchResults.length === 0) {
          this.logger.log('No vehicles found matching criteria');
          return {
            next: 'recommendation',
            recommendations: [],
            metadata: {
              ...state.metadata,
              lastMessageAt: Date.now(),
              flags: [...state.metadata.flags, 'no_results'],
            },
          };
        }

        // Convert to recommendations
        const recommendations: VehicleRecommendation[] = searchResults.map((result) => ({
          vehicleId: result.id,
          matchScore: Math.round(result.score * 100),
          reasoning: this.generateReasoning(result, state.profile),
          highlights: this.generateHighlights(result, state.profile),
          concerns: [],
          vehicle: {
            id: result.id,
            make: result.make,
            model: result.model,
            yearModel: result.yearModel,
            price: result.price,
            mileage: result.mileage,
            bodyType: result.bodyType,
            features: result.aiTags,
          },
        }));

        this.logger.log(`Found ${recommendations.length} vehicles`);

        // Store last shown vehicles
        const lastShownVehicles = recommendations.slice(0, 3).map((rec) => ({
          vehicleId: rec.vehicleId,
          brand: rec.vehicle?.make || '',
          model: rec.vehicle?.model || '',
          year: rec.vehicle?.yearModel || 0,
          price: rec.vehicle?.price || 0,
        }));

        return {
          next: 'recommendation',
          recommendations: recommendations.slice(0, 3),
          profile: {
            ...state.profile,
            _lastShownVehicles: lastShownVehicles,
            _showedRecommendation: true,
          },
          metadata: {
            ...state.metadata,
            lastMessageAt: Date.now(),
          },
        };
      } catch (error) {
        this.logger.error('Search failed:', error);
        return {
          next: 'recommendation',
          recommendations: [],
          metadata: {
            ...state.metadata,
            lastMessageAt: Date.now(),
            errorCount: state.metadata.errorCount + 1,
            flags: [...state.metadata.flags, 'search_error'],
          },
        };
      }
    };
  }

  /**
   * Build search query from customer profile
   */
  private buildSearchQuery(profile: Partial<CustomerProfile>): string {
    const parts: string[] = [];

    if (profile.bodyType) {
      parts.push(profile.bodyType);
    }

    if (profile.brand) {
      parts.push(profile.brand);
    }

    if (profile.model) {
      parts.push(profile.model);
    }

    if (profile.usage) {
      const usageMap: Record<string, string> = {
        cidade: 'econômico urbano',
        viagem: 'confortável espaçoso',
        trabalho: 'robusto prático',
        app: 'econômico confortável sedan',
        misto: 'versátil',
      };
      parts.push(usageMap[profile.usage] || profile.usage);
    }

    if (profile.budget) {
      if (profile.budget < 50000) {
        parts.push('econômico popular');
      } else if (profile.budget < 100000) {
        parts.push('intermediário');
      } else {
        parts.push('premium completo');
      }
    }

    if (profile.people && profile.people > 4) {
      parts.push('espaçoso família grande');
    }

    if (profile.priorities) {
      parts.push(...profile.priorities);
    }

    return parts.join(' ') || 'carro seminovo';
  }

  /**
   * Generate reasoning for why a vehicle matches
   */
  private generateReasoning(vehicle: any, profile: Partial<CustomerProfile>): string {
    const reasons: string[] = [];

    if (profile.bodyType && vehicle.bodyType?.toLowerCase() === profile.bodyType.toLowerCase()) {
      reasons.push(`É um ${profile.bodyType} como você pediu`);
    }

    if (profile.budget && vehicle.price <= profile.budget) {
      reasons.push('Dentro do seu orçamento');
    }

    if (profile.minYear && vehicle.yearModel >= profile.minYear) {
      reasons.push(`Ano ${vehicle.yearModel}`);
    }

    if (vehicle.mileage < 50000) {
      reasons.push('Baixa quilometragem');
    }

    return reasons.length > 0 ? reasons[0] : 'Ótima opção para você';
  }

  /**
   * Generate highlights for a vehicle
   */
  private generateHighlights(vehicle: any, profile: Partial<CustomerProfile>): string[] {
    const highlights: string[] = [];

    if (vehicle.mileage < 30000) {
      highlights.push('Pouquíssimo rodado');
    } else if (vehicle.mileage < 60000) {
      highlights.push('Baixa quilometragem');
    }

    if (vehicle.yearModel >= new Date().getFullYear() - 2) {
      highlights.push('Modelo recente');
    }

    if (vehicle.aiTags?.includes('Câmbio Automático')) {
      highlights.push('Câmbio automático');
    }

    if (profile.usage === 'app' && vehicle.bodyType?.toLowerCase() === 'sedan') {
      highlights.push('Ideal para aplicativo');
    }

    return highlights.slice(0, 3);
  }

  /**
   * Process a message through the conversation graph
   */
  async processMessage(
    threadId: string,
    message: string,
    context?: { 
      userId?: string; 
      phoneNumber?: string;
      interestedVehicle?: {
        id: string;
        make: string;
        model: string;
        yearModel: number;
        price: number;
        mileage?: number;
        bodyType?: string;
      };
    },
  ): Promise<ConversationResponse> {
    const startTime = Date.now();
    this.logger.log(`Processing message for thread: ${threadId}`);

    try {
      // Get or create session
      let session = this.sessions.get(threadId);
      if (!session) {
        session = {
          threadId,
          state: createInitialState(),
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        if (context?.userId) {
          session.state.userId = context.userId;
        }
        if (context?.phoneNumber) {
          session.state.phoneNumber = context.phoneNumber;
        }
        
        // If there's an interested vehicle, set it as the initial recommendation
        // This creates the lead context - the customer started from this specific vehicle
        if (context?.interestedVehicle) {
          const vehicle = context.interestedVehicle;
          session.state.recommendations = [{
            vehicleId: vehicle.id,
            matchScore: 100, // Perfect match since customer chose it
            reasoning: 'Veículo que você selecionou',
            highlights: ['Você demonstrou interesse neste veículo'],
            concerns: [],
            vehicle: {
              id: vehicle.id,
              make: vehicle.make,
              model: vehicle.model,
              yearModel: vehicle.yearModel,
              price: vehicle.price,
              mileage: vehicle.mileage || 0,
              bodyType: vehicle.bodyType || '',
            },
          }];
          
          // Store in profile for lead tracking
          session.state.profile = {
            ...session.state.profile,
            _lastShownVehicles: [{
              vehicleId: vehicle.id,
              brand: vehicle.make,
              model: vehicle.model,
              year: vehicle.yearModel,
              price: vehicle.price,
            }],
            // Extract preferences from the vehicle they're interested in
            bodyType: vehicle.bodyType?.toLowerCase() as any,
            budget: Math.round(vehicle.price * 1.2), // Allow 20% flexibility
          };
          
          // Skip to recommendation node since we already have a vehicle
          session.state.next = 'recommendation';
          
          this.logger.log(`Lead context set for vehicle ${vehicle.id}: ${vehicle.make} ${vehicle.model}`);
        }
        
        this.sessions.set(threadId, session);
      }

      // Invoke the graph with the new message
      const config = { configurable: { thread_id: threadId } };
      
      // Prepare input - spread state first, then add new message
      const input = {
        ...session.state,
        messages: [...session.state.messages, new HumanMessage(message)],
      };

      const result = await this.app.invoke(input, config);

      const finalState = result as IGraphState;

      // Update session
      session.state = finalState;
      session.updatedAt = new Date();

      // Extract response from last AI message
      const lastMessage = finalState.messages[finalState.messages.length - 1];
      const responseContent = lastMessage?.content?.toString() || 'Desculpe, não entendi. Pode reformular?';

      // Determine suggested actions
      const suggestedActions = this.determineSuggestedActions(finalState);

      this.logger.log(`Message processed in ${Date.now() - startTime}ms, next: ${finalState.next}`);

      return {
        response: responseContent,
        sessionId: threadId,
        currentNode: finalState.next,
        recommendations: finalState.recommendations,
        profile: finalState.profile,
        suggestedActions,
      };
    } catch (error: any) {
      this.logger.error(`Error processing message: ${error.message}`, error.stack);

      return {
        response: 'Desculpe, tive um problema ao processar sua mensagem. Pode tentar novamente? 🤔',
        sessionId: threadId,
        currentNode: 'error',
        suggestedActions: ['RETRY', 'HANDOFF_HUMAN'],
      };
    }
  }

  /**
   * Determine suggested actions based on current state
   */
  private determineSuggestedActions(state: IGraphState): string[] {
    const actions: string[] = [];

    if (state.metadata.flags.includes('handoff_requested')) {
      actions.push('HANDOFF_HUMAN');
    }

    if (state.metadata.flags.includes('visit_requested')) {
      actions.push('SCHEDULE_VISIT');
    }

    if (state.recommendations.length > 0) {
      actions.push('SHOW_DETAILS');
      actions.push('SHOW_FINANCING');
    }

    if (state.profile.wantsFinancing) {
      actions.push('FINANCING_SIMULATION');
    }

    if (state.profile.hasTradeIn) {
      actions.push('TRADE_IN_EVALUATION');
    }

    return actions;
  }

  /**
   * Get session state (for debugging/admin)
   */
  getSession(threadId: string): ConversationSession | undefined {
    return this.sessions.get(threadId);
  }

  /**
   * Clear session (reset conversation)
   */
  clearSession(threadId: string): void {
    this.sessions.delete(threadId);
    this.logger.log(`Session cleared: ${threadId}`);
  }

  /**
   * Get all active sessions count
   */
  getActiveSessionsCount(): number {
    return this.sessions.size;
  }
}
