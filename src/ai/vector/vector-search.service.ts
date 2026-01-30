import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EmbeddingService } from '../embeddings/embedding.service';
import { Prisma } from '@prisma/client';

export interface VehicleSearchResult {
  id: string;
  make: string;
  model: string;
  yearModel: number;
  price: number;
  mileage: number;
  bodyType: string;
  condition: string;
  aiTags: string[];
  score: number;
  dealer?: {
    name: string;
    verificationStatus: string;
  };
  media?: {
    url: string;
    type: string;
  }[];
}

interface SearchFilters {
  priceMin?: number;
  priceMax?: number;
  yearMin?: number;
  yearMax?: number;
  make?: string;
  bodyType?: string;
  condition?: 'NEW' | 'USED';
}

@Injectable()
export class VectorSearchService {
  private readonly logger = new Logger(VectorSearchService.name);

  constructor(
    private prisma: PrismaService,
    private embeddingService: EmbeddingService,
  ) {}

  /**
   * Semantic search for vehicles using embeddings
   */
  async searchSemantic(
    query: string,
    limit: number = 10,
    filters?: SearchFilters,
  ): Promise<VehicleSearchResult[]> {
    this.logger.log(`Semantic search: "${query}" with limit ${limit}`);

    // Generate query embedding
    const queryEmbedding = await this.embeddingService.generateEmbedding(query);

    if (!queryEmbedding) {
      this.logger.warn('Could not generate query embedding, falling back to text search');
      return this.fallbackTextSearch(query, limit, filters);
    }

    // Get vehicles with embeddings
    const whereClause = this.buildWhereClause(filters);

    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        ...whereClause,
        status: 'AVAILABLE',
        embedding: { not: Prisma.DbNull },
      },
      include: {
        dealer: {
          select: { name: true, verificationStatus: true },
        },
        media: {
          take: 3,
          orderBy: { order: 'asc' },
        },
      },
    });

    if (vehicles.length === 0) {
      this.logger.warn('No vehicles with embeddings found, falling back to text search');
      return this.fallbackTextSearch(query, limit, filters);
    }

    // Calculate similarity scores
    const scoredVehicles = vehicles
      .map((vehicle) => {
        const vehicleEmbedding = vehicle.embedding as number[];
        const score = this.embeddingService.cosineSimilarity(
          queryEmbedding,
          vehicleEmbedding,
        );

        return {
          id: vehicle.id,
          make: vehicle.make,
          model: vehicle.model,
          yearModel: vehicle.yearModel,
          price: Number(vehicle.price),
          mileage: vehicle.mileage,
          bodyType: vehicle.bodyType,
          condition: vehicle.condition,
          aiTags: vehicle.aiTags,
          score,
          dealer: vehicle.dealer,
          media: vehicle.media,
        };
      })
      .filter((v) => v.score > 0.3) // Minimum relevance threshold
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    this.logger.log(`Found ${scoredVehicles.length} relevant vehicles`);
    return scoredVehicles;
  }

  /**
   * Find similar vehicles to a given vehicle
   */
  async findSimilar(
    vehicleId: string,
    limit: number = 5,
  ): Promise<VehicleSearchResult[]> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
    });

    if (!vehicle || !vehicle.embedding) {
      this.logger.warn(`Vehicle ${vehicleId} not found or has no embedding`);
      return [];
    }

    const sourceEmbedding = vehicle.embedding as number[];

    const candidates = await this.prisma.vehicle.findMany({
      where: {
        id: { not: vehicleId },
        status: 'AVAILABLE',
        embedding: { not: Prisma.DbNull },
      },
      include: {
        dealer: {
          select: { name: true, verificationStatus: true },
        },
        media: {
          take: 1,
          orderBy: { order: 'asc' },
        },
      },
    });

    const scored = candidates
      .map((v) => ({
        id: v.id,
        make: v.make,
        model: v.model,
        yearModel: v.yearModel,
        price: Number(v.price),
        mileage: v.mileage,
        bodyType: v.bodyType,
        condition: v.condition,
        aiTags: v.aiTags,
        score: this.embeddingService.cosineSimilarity(
          sourceEmbedding,
          v.embedding as number[],
        ),
        dealer: v.dealer,
        media: v.media,
      }))
      .filter((v) => v.score > 0.5)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return scored;
  }

  /**
   * Hybrid search combining semantic and filters
   */
  async hybridSearch(
    query: string,
    filters: SearchFilters,
    limit: number = 10,
  ): Promise<VehicleSearchResult[]> {
    // If query is empty, just use filters
    if (!query.trim()) {
      return this.filterSearch(filters, limit);
    }

    return this.searchSemantic(query, limit, filters);
  }

  /**
   * Filter-only search (no semantic)
   */
  async filterSearch(
    filters: SearchFilters,
    limit: number = 20,
  ): Promise<VehicleSearchResult[]> {
    const whereClause = this.buildWhereClause(filters);

    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        ...whereClause,
        status: 'AVAILABLE',
      },
      include: {
        dealer: {
          select: { name: true, verificationStatus: true },
        },
        media: {
          take: 3,
          orderBy: { order: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return vehicles.map((v) => ({
      id: v.id,
      make: v.make,
      model: v.model,
      yearModel: v.yearModel,
      price: Number(v.price),
      mileage: v.mileage,
      bodyType: v.bodyType,
      condition: v.condition,
      aiTags: v.aiTags,
      score: 1.0,
      dealer: v.dealer,
      media: v.media,
    }));
  }

  private async fallbackTextSearch(
    query: string,
    limit: number,
    filters?: SearchFilters,
  ): Promise<VehicleSearchResult[]> {
    const whereClause = this.buildWhereClause(filters);

    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        ...whereClause,
        status: 'AVAILABLE',
        OR: [
          { make: { contains: query, mode: 'insensitive' } },
          { model: { contains: query, mode: 'insensitive' } },
          { bodyType: { contains: query, mode: 'insensitive' } },
          { title: { contains: query, mode: 'insensitive' } },
        ],
      },
      include: {
        dealer: {
          select: { name: true, verificationStatus: true },
        },
        media: {
          take: 3,
          orderBy: { order: 'asc' },
        },
      },
      take: limit,
      orderBy: { price: 'asc' },
    });

    return vehicles.map((v) => ({
      id: v.id,
      make: v.make,
      model: v.model,
      yearModel: v.yearModel,
      price: Number(v.price),
      mileage: v.mileage,
      bodyType: v.bodyType,
      condition: v.condition,
      aiTags: v.aiTags,
      score: 0.7, // Default score for text search
      dealer: v.dealer,
      media: v.media,
    }));
  }

  private buildWhereClause(filters?: SearchFilters): Prisma.VehicleWhereInput {
    if (!filters) return {};

    const where: Prisma.VehicleWhereInput = {};

    if (filters.priceMin || filters.priceMax) {
      where.price = {};
      if (filters.priceMin) where.price.gte = filters.priceMin;
      if (filters.priceMax) where.price.lte = filters.priceMax;
    }

    if (filters.yearMin || filters.yearMax) {
      where.yearModel = {};
      if (filters.yearMin) where.yearModel.gte = filters.yearMin;
      if (filters.yearMax) where.yearModel.lte = filters.yearMax;
    }

    if (filters.make) {
      where.make = { equals: filters.make, mode: 'insensitive' };
    }

    if (filters.bodyType) {
      where.bodyType = { equals: filters.bodyType, mode: 'insensitive' };
    }

    if (filters.condition) {
      where.condition = filters.condition;
    }

    return where;
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

  /**
   * Get search statistics
   */
  async getSearchStats() {
    const [total, withEmbedding, available] = await Promise.all([
      this.prisma.vehicle.count(),
      this.prisma.vehicle.count({ where: { embedding: { not: Prisma.DbNull } } }),
      this.prisma.vehicle.count({ where: { status: 'AVAILABLE' } }),
    ]);

    return {
      totalVehicles: total,
      vehiclesWithEmbedding: withEmbedding,
      availableVehicles: available,
      embeddingCoverage: total > 0 ? ((withEmbedding / total) * 100).toFixed(1) + '%' : '0%',
    };
  }
}
