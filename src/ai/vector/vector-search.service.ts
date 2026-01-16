import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EmbeddingService } from '../embeddings/embedding.service';

interface VehicleWithScore {
    id: string;
    make: string;
    model: string;
    price: number;
    yearModel: number;
    score: number;
}

@Injectable()
export class VectorSearchService {
    private readonly logger = new Logger(VectorSearchService.name);

    constructor(
        private prisma: PrismaService,
        private embeddingService: EmbeddingService,
    ) { }

    async searchSemantic(
        query: string,
        limit: number = 10,
    ): Promise<VehicleWithScore[]> {
        this.logger.log(`Semantic search: "${query}"`);

        // Generate query embedding
        const queryEmbedding = await this.embeddingService.generateEmbedding(query);
        if (!queryEmbedding) {
            this.logger.warn('Could not generate query embedding, falling back to text search');
            return this.fallbackTextSearch(query, limit);
        }

        // Get all vehicles with embeddings
        const vehicles = await this.prisma.vehicle.findMany({
            where: {
                status: 'AVAILABLE',
            },
            select: {
                id: true,
                make: true,
                model: true,
                price: true,
                yearModel: true,
                aiTags: true,
                // Note: embedding field needs to be added to schema
            },
        });

        // For now, use fallback until embeddings are synced
        return this.fallbackTextSearch(query, limit);
    }

    private async fallbackTextSearch(
        query: string,
        limit: number,
    ): Promise<VehicleWithScore[]> {
        const searchTerms = query.toLowerCase().split(' ');

        const vehicles = await this.prisma.vehicle.findMany({
            where: {
                status: 'AVAILABLE',
                OR: [
                    { make: { contains: query, mode: 'insensitive' } },
                    { model: { contains: query, mode: 'insensitive' } },
                    { bodyType: { contains: query, mode: 'insensitive' } },
                ],
            },
            take: limit,
            orderBy: { price: 'asc' },
        });

        return vehicles.map((v) => ({
            id: v.id,
            make: v.make,
            model: v.model,
            price: Number(v.price),
            yearModel: v.yearModel,
            score: 0.8, // Default score for text search
        }));
    }

    async getVehicleById(id: string) {
        return this.prisma.vehicle.findUnique({
            where: { id },
            include: {
                media: true,
                dealer: true,
            },
        });
    }
}
