import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private openai: OpenAI | null = null;

  private readonly MODEL = 'text-embedding-3-small';
  private readonly DIMENSIONS = 1536;

  constructor(private prisma: PrismaService) {
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      this.logger.log('Embedding service initialized with OpenAI');
    } else {
      this.logger.warn('OpenAI API key not configured - embeddings disabled');
    }
  }

  async generateEmbedding(text: string): Promise<number[] | null> {
    if (!this.openai) {
      this.logger.warn('OpenAI not configured, cannot generate embeddings');
      return null;
    }

    try {
      const response = await this.openai.embeddings.create({
        model: this.MODEL,
        input: text,
        dimensions: this.DIMENSIONS,
      });

      return response.data[0]?.embedding || null;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to generate embedding: ${errorMessage}`);
      return null;
    }
  }

  async generateBatchEmbeddings(texts: string[]): Promise<(number[] | null)[]> {
    if (!this.openai || texts.length === 0) {
      return texts.map(() => null);
    }

    try {
      const response = await this.openai.embeddings.create({
        model: this.MODEL,
        input: texts,
        dimensions: this.DIMENSIONS,
      });

      return response.data.map((item) => item.embedding);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to generate batch embeddings: ${errorMessage}`);
      return texts.map(() => null);
    }
  }

  /**
   * Generate embedding text for a vehicle (used for semantic search)
   */
  generateVehicleEmbeddingText(vehicle: {
    make: string;
    model: string;
    yearModel: number;
    bodyType: string;
    price: number | Prisma.Decimal;
    mileage: number;
    condition: string;
    features: string[];
    aiTags: string[];
    technicalSpecs?: Record<string, unknown> | Prisma.JsonValue;
  }): string {
    const specs = (vehicle.technicalSpecs as Record<string, unknown>) || {};
    const price = Number(vehicle.price);

    const parts = [
      `${vehicle.make} ${vehicle.model} ${vehicle.yearModel}`,
      `Tipo: ${vehicle.bodyType}`,
      `Condição: ${vehicle.condition === 'NEW' ? 'Zero km' : 'Seminovo'}`,
      `Preço: R$ ${price.toLocaleString('pt-BR')}`,
      `Quilometragem: ${vehicle.mileage.toLocaleString()} km`,
    ];

    if (specs.engine && typeof specs.engine === 'string')
      parts.push(`Motor: ${specs.engine}`);
    if (specs.transmission && typeof specs.transmission === 'string')
      parts.push(`Câmbio: ${specs.transmission}`);
    if (specs.fuel && typeof specs.fuel === 'string')
      parts.push(`Combustível: ${specs.fuel}`);
    if (specs.power && typeof specs.power === 'string')
      parts.push(`Potência: ${specs.power}`);

    if (vehicle.features.length > 0) {
      parts.push(`Opcionais: ${vehicle.features.join(', ')}`);
    }

    if (vehicle.aiTags.length > 0) {
      parts.push(`Características: ${vehicle.aiTags.join(', ')}`);
    }

    return parts.join('. ');
  }

  /**
   * Sync embedding for a single vehicle
   */
  async syncVehicleEmbedding(vehicleId: string): Promise<boolean> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
    });

    if (!vehicle) {
      this.logger.warn(`Vehicle ${vehicleId} not found`);
      return false;
    }

    const embeddingText = this.generateVehicleEmbeddingText(vehicle);

    // Skip if text hasn't changed
    if (vehicle.embeddingText === embeddingText && vehicle.embedding) {
      this.logger.debug(`Vehicle ${vehicleId} embedding is up to date`);
      return true;
    }

    const embedding = await this.generateEmbedding(embeddingText);

    if (!embedding) {
      this.logger.warn(`Failed to generate embedding for vehicle ${vehicleId}`);
      return false;
    }

    await this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: {
        embedding: embedding as unknown as Prisma.InputJsonValue,
        embeddingText,
      },
    });

    this.logger.log(`Synced embedding for vehicle ${vehicleId}`);
    return true;
  }

  /**
   * Sync embeddings for all vehicles without embeddings
   */
  async syncAllVehicleEmbeddings(batchSize: number = 10): Promise<{
    synced: number;
    failed: number;
    skipped: number;
  }> {
    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        OR: [
          { embedding: { equals: Prisma.DbNull } },
          { embeddingText: { equals: null } },
        ],
      },
      select: {
        id: true,
        make: true,
        model: true,
        yearModel: true,
        bodyType: true,
        price: true,
        mileage: true,
        condition: true,
        features: true,
        aiTags: true,
        technicalSpecs: true,
        embeddingText: true,
      },
    });

    this.logger.log(`Found ${vehicles.length} vehicles needing embedding sync`);

    let synced = 0;
    let failed = 0;
    const skipped = 0;

    // Process in batches
    for (let i = 0; i < vehicles.length; i += batchSize) {
      const batch = vehicles.slice(i, i + batchSize);
      const texts = batch.map((v) => this.generateVehicleEmbeddingText(v));

      const embeddings = await this.generateBatchEmbeddings(texts);

      for (let j = 0; j < batch.length; j++) {
        const vehicle = batch[j];
        const embedding = embeddings[j];

        if (!embedding) {
          failed++;
          continue;
        }

        try {
          await this.prisma.vehicle.update({
            where: { id: vehicle.id },
            data: {
              embedding: embedding as unknown as Prisma.InputJsonValue,
              embeddingText: texts[j],
            },
          });
          synced++;
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          this.logger.error(
            `Failed to save embedding for ${vehicle.id}: ${errorMessage}`,
          );
          failed++;
        }
      }

      this.logger.log(
        `Processed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(vehicles.length / batchSize)}`,
      );
    }

    return { synced, failed, skipped };
  }

  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }

  isAvailable(): boolean {
    return this.openai !== null;
  }
}
