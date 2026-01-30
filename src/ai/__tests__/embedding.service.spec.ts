import { Test, TestingModule } from '@nestjs/testing';
import { EmbeddingService } from '../embeddings/embedding.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('EmbeddingService', () => {
  let service: EmbeddingService;

  beforeEach(async () => {
    const mockPrismaService = {
      vehicle: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmbeddingService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<EmbeddingService>(EmbeddingService);
  });

  describe('generateVehicleEmbeddingText', () => {
    it('should generate embedding text for a vehicle', () => {
      const vehicle = {
        make: 'Toyota',
        model: 'Corolla',
        yearModel: 2023,
        bodyType: 'Sedan',
        price: 150000,
        mileage: 15000,
        condition: 'USED',
        features: ['Ar condicionado', 'Direção elétrica'],
        aiTags: ['Seminovo', 'Baixa Quilometragem'],
        technicalSpecs: {
          engine: '2.0 Flex',
          transmission: 'Automático',
          fuel: 'Flex',
        },
      };

      const text = service.generateVehicleEmbeddingText(vehicle);

      expect(text).toContain('Toyota Corolla 2023');
      expect(text).toContain('Sedan');
      expect(text).toContain('Seminovo');
      expect(text).toContain('15.000 km');
      expect(text).toContain('Automático');
      expect(text).toContain('Ar condicionado');
    });

    it('should handle vehicle with minimal data', () => {
      const vehicle = {
        make: 'Honda',
        model: 'Civic',
        yearModel: 2020,
        bodyType: 'Sedan',
        price: 100000,
        mileage: 50000,
        condition: 'USED',
        features: [],
        aiTags: [],
      };

      const text = service.generateVehicleEmbeddingText(vehicle);

      expect(text).toContain('Honda Civic 2020');
      expect(text).not.toContain('Opcionais:');
    });
  });

  describe('cosineSimilarity', () => {
    it('should return 1 for identical vectors', () => {
      const vector = [0.1, 0.2, 0.3, 0.4];
      const similarity = service.cosineSimilarity(vector, vector);
      expect(similarity).toBeCloseTo(1, 5);
    });

    it('should return 0 for orthogonal vectors', () => {
      const a = [1, 0, 0];
      const b = [0, 1, 0];
      const similarity = service.cosineSimilarity(a, b);
      expect(similarity).toBeCloseTo(0, 5);
    });

    it('should return -1 for opposite vectors', () => {
      const a = [1, 0, 0];
      const b = [-1, 0, 0];
      const similarity = service.cosineSimilarity(a, b);
      expect(similarity).toBeCloseTo(-1, 5);
    });

    it('should return 0 for vectors of different lengths', () => {
      const a = [1, 2, 3];
      const b = [1, 2];
      const similarity = service.cosineSimilarity(a, b);
      expect(similarity).toBe(0);
    });

    it('should handle zero vectors', () => {
      const a = [0, 0, 0];
      const b = [1, 2, 3];
      const similarity = service.cosineSimilarity(a, b);
      expect(similarity).toBe(0);
    });
  });

  describe('isAvailable', () => {
    it('should return false when OpenAI is not configured', () => {
      // OpenAI is not configured in test environment
      expect(service.isAvailable()).toBe(false);
    });
  });
});
