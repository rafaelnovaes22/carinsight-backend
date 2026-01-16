import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LlmRouterService } from '../llm/llm-router.service';
import { VectorSearchService } from '../vector/vector-search.service';

interface StartChatDto {
    vehicleId: string;
    userId?: string;
    metadata?: Record<string, unknown>;
}

interface SendMessageDto {
    content: string;
}

export interface ChatResponse {
    response: string;
    suggestedActions?: string[];
}

@Injectable()
export class ChatService {
    private readonly logger = new Logger(ChatService.name);

    constructor(
        private prisma: PrismaService,
        private llmRouter: LlmRouterService,
        private vectorSearch: VectorSearchService,
    ) { }

    /**
     * Start a new chat session with vehicle context
     * Triggered by "Conversar com vendedor" button
     */
    async startChat(dto: StartChatDto): Promise<{ sessionId: string; greeting: string }> {
        this.logger.log(`Starting chat for vehicle: ${dto.vehicleId}`);

        // Get vehicle details
        const vehicle = await this.vectorSearch.getVehicleById(dto.vehicleId);
        if (!vehicle) {
            throw new Error('Vehicle not found');
        }

        // Create conversation session (using UserInteraction for now)
        const session = await this.prisma.userInteraction.create({
            data: {
                vehicleId: dto.vehicleId,
                userId: dto.userId || null,
                type: 'CONTACTED',
                metadata: {
                    source: 'web_chat',
                    startedAt: new Date().toISOString(),
                    ...dto.metadata,
                },
            },
        });

        // Generate contextual greeting
        const vehicleDescription = `${vehicle.make} ${vehicle.model} ${vehicle.yearModel}`;
        const price = Number(vehicle.price).toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL',
        });

        const greeting = await this.generateContextualGreeting(vehicleDescription, price);

        return {
            sessionId: session.id,
            greeting,
        };
    }

    /**
     * Process a message in an existing chat session
     */
    async sendMessage(
        sessionId: string,
        dto: SendMessageDto,
    ): Promise<ChatResponse> {
        this.logger.log(`Processing message in session: ${sessionId}`);

        // Get session context
        const session = await this.prisma.userInteraction.findUnique({
            where: { id: sessionId },
            include: { vehicle: true },
        });

        if (!session) {
            throw new Error('Session not found');
        }

        // Build conversation context
        const vehicleContext = `
Veículo em discussão:
- ${session.vehicle.make} ${session.vehicle.model} ${session.vehicle.yearModel}
- Preço: R$ ${Number(session.vehicle.price).toLocaleString('pt-BR')}
- Tipo: ${session.vehicle.bodyType}
- Quilometragem: ${session.vehicle.mileage.toLocaleString()} km
    `.trim();

        // Generate response using LLM
        const response = await this.llmRouter.chat([
            {
                role: 'system',
                content: `Você é um assistente de vendas de uma concessionária de veículos. 
Você está ajudando um cliente interessado em um veículo específico.
Seja prestativo, responda dúvidas sobre o veículo, financiamento, e condições de pagamento.
Se o cliente quiser falar com um vendedor humano, ofereça essa opção.

${vehicleContext}`,
            },
            {
                role: 'user',
                content: dto.content,
            },
        ]);

        // Detect if customer wants human handoff
        const suggestedActions: string[] = [];
        const lowerContent = dto.content.toLowerCase();
        if (
            lowerContent.includes('vendedor') ||
            lowerContent.includes('humano') ||
            lowerContent.includes('ligar') ||
            lowerContent.includes('whatsapp')
        ) {
            suggestedActions.push('HANDOFF_HUMAN');
        }

        if (
            lowerContent.includes('financ') ||
            lowerContent.includes('parcel')
        ) {
            suggestedActions.push('SHOW_FINANCING');
        }

        if (
            lowerContent.includes('test') ||
            lowerContent.includes('conhecer')
        ) {
            suggestedActions.push('SCHEDULE_TEST_DRIVE');
        }

        return {
            response: response.content,
            suggestedActions,
        };
    }

    private async generateContextualGreeting(
        vehicleDescription: string,
        price: string,
    ): Promise<string> {
        const response = await this.llmRouter.chat([
            {
                role: 'system',
                content: `Você é um assistente de vendas amigável. Gere uma saudação curta e acolhedora 
para um cliente que está interessado em um veículo. A saudação deve:
- Ser breve (máximo 2 frases)
- Mencionar o veículo específico
- Convidar para perguntas
- Ser em português brasileiro`,
            },
            {
                role: 'user',
                content: `Cliente interessado em: ${vehicleDescription} por ${price}`,
            },
        ]);

        return response.content;
    }
}
