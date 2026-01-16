import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';

@Injectable()
export class EmbeddingService {
    private readonly logger = new Logger(EmbeddingService.name);
    private openai: OpenAI | null = null;

    private readonly MODEL = 'text-embedding-3-small';
    private readonly DIMENSIONS = 1536;

    constructor() {
        if (process.env.OPENAI_API_KEY) {
            this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
            this.logger.log('Embedding service initialized with OpenAI');
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
        } catch (error) {
            this.logger.error(`Failed to generate embedding: ${error.message}`);
            return null;
        }
    }

    async generateBatchEmbeddings(
        texts: string[],
    ): Promise<(number[] | null)[]> {
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
        } catch (error) {
            this.logger.error(`Failed to generate batch embeddings: ${error.message}`);
            return texts.map(() => null);
        }
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
}
