import { Test, TestingModule } from '@nestjs/testing';
import { VectorSearchService } from '../vector/vector-search.service';
import { EmbeddingService } from '../embeddings/embedding.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('VectorSearchService', () => {
  let service: VectorSearchService;
  let prismaService: jest.Mocked<PrismaService>;
  let embeddingService: jest.Mocked<EmbeddingService>;

  const mockVehicle = {
    id: 'vehicle-123',
    make: 'Toyota',
    model: 'Corolla',
    yearModel: 2023,
    price: { toNumber: () => 150000 },
    mileage: 15000,
    bodyType: 'Sedan',
    condition: 'USED',
    aiTags: ['Seminovo'],
    embedding: [0.1, 0.2, 0.3],
    dealer: { name: 'Test Dealer', verificationStatus: 'VERIFIED' },
    media: [{ url: 'http://example.com/img.jpg', type: 'IMAGE' }],
  };

  beforeEach(async () => {
    const mockPrismaService = {
      vehicle: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
      },
    };

    const mockEmbeddingService = {
      generateEmbedding: jest.fn(),
      cosineSimilarity: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VectorSearchService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EmbeddingService, useValue: mockEmbeddingService },
      ],
    }).compile();

    service = module.get<VectorSearchService>(VectorSearchService);
    prismaService = module.get(PrismaService);
    embeddingService = module.get(EmbeddingService);
  });

  describe('searchSemantic', () => {
    it('should return scored vehicles when embeddings are available', async () => {
      embeddingService.generateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
      prismaService.vehicle.findMany.mockResolvedValue([mockVehicle]);
      embeddingService.cosineSimilarity.mockReturnValue(0.85);

      const results = await service.searchSemantic('carro econômico', 10);

      expect(results).toHaveLength(1);
      expect(results[0].score).toBe(0.85);
      expect(results[0].make).toBe('Toyota');
    });

    it('should fall back to text search when embedding fails', async () => {
      embeddingService.generateEmbedding.mockResolvedValue(null);
      prismaService.vehicle.findMany.mockResolvedValue([mockVehicle]);

      const results = await service.searchSemantic('corolla', 10);

      expect(results).toHaveLength(1);
      expect(results[0].score).toBe(0.7); // Default text search score
    });

    it('should filter out low-relevance results', async () => {
      embeddingService.generateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
      prismaService.vehicle.findMany.mockResolvedValue([mockVehicle]);
      embeddingService.cosineSimilarity.mockReturnValue(0.2); // Below threshold

      const results = await service.searchSemantic('algo irrelevante', 10);

      expect(results).toHaveLength(0);
    });
  });

  describe('findSimilar', () => {
    it('should return similar vehicles', async () => {
      prismaService.vehicle.findUnique.mockResolvedValue(mockVehicle);
      prismaService.vehicle.findMany.mockResolvedValue([
        { ...mockVehicle, id: 'vehicle-456' },
      ]);
      embeddingService.cosineSimilarity.mockReturnValue(0.9);

      const results = await service.findSimilar('vehicle-123', 5);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('vehicle-456');
    });

    it('should return empty array if vehicle not found', async () => {
      prismaService.vehicle.findUnique.mockResolvedValue(null);

      const results = await service.findSimilar('invalid-id', 5);

      expect(results).toHaveLength(0);
    });
  });

  describe('getSearchStats', () => {
    it('should return search statistics', async () => {
      prismaService.vehicle.count
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(80) // with embedding
        .mockResolvedValueOnce(90); // available

      const stats = await service.getSearchStats();

      expect(stats.totalVehicles).toBe(100);
      expect(stats.vehiclesWithEmbedding).toBe(80);
      expect(stats.availableVehicles).toBe(90);
      expect(stats.embeddingCoverage).toBe('80.0%');
    });
  });

  describe('filterSearch', () => {
    it('should apply price filters', async () => {
      prismaService.vehicle.findMany.mockResolvedValue([mockVehicle]);

      await service.filterSearch({ priceMin: 100000, priceMax: 200000 }, 10);

      expect(prismaService.vehicle.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            price: { gte: 100000, lte: 200000 },
          }),
        }),
      );
    });

    it('should apply year filters', async () => {
      prismaService.vehicle.findMany.mockResolvedValue([mockVehicle]);

      await service.filterSearch({ yearMin: 2020, yearMax: 2024 }, 10);

      expect(prismaService.vehicle.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            yearModel: { gte: 2020, lte: 2024 },
          }),
        }),
      );
    });
  });
});
