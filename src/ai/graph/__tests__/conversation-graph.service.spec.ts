import { Test, TestingModule } from '@nestjs/testing';
import { ConversationGraphService } from '../conversation-graph.service';
import { VectorSearchService } from '../../vector/vector-search.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { IGraphState } from '../types/graph-state.types';

describe('ConversationGraphService', () => {
  let service: ConversationGraphService;
  let vectorSearchService: jest.Mocked<VectorSearchService>;
  let prismaService: any;

  // Define mockVehicles here to be accessible by mockVectorSearch
  const mockVehicles = [
    {
      id: 'vehicle-1',
      make: 'Toyota',
      model: 'Corolla',
      yearModel: 2022,
      price: 95000,
      mileage: 30000,
      bodyType: 'Sedan',
      condition: 'USED',
      aiTags: ['Econômico', 'Confortável'],
      score: 0.85,
    },
    {
      id: 'vehicle-123',
      make: 'Toyota',
      model: 'Corolla',
      yearModel: 2023,
      price: 120000,
      mileage: 15000,
      bodyType: 'Sedan',
    },
  ];

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();

    const mockVectorSearch = {
      searchSemantic: jest.fn().mockResolvedValue(mockVehicles),
      getVehicleById: jest
        .fn()
        .mockImplementation((id) =>
          Promise.resolve(mockVehicles.find((v) => v.id === id) || null),
        ),
      findSimilar: jest.fn(), // Keep existing mocks if not explicitly changed
      hybridSearch: jest.fn(),
      filterSearch: jest.fn(),
      getSearchStats: jest.fn(),
    };

    const mockDb = new Map<string, any>();

    const mockPrismaService = {
      chatSession: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          return Promise.resolve(mockDb.get(where.threadId) || null);
        }),
        create: jest.fn().mockImplementation(({ data }) => {
          const newSession = {
            id: 'mock-id',
            threadId: data.threadId,
            state: data.state,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          mockDb.set(data.threadId, newSession);
          return Promise.resolve(newSession);
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const existing = mockDb.get(where.threadId);
          if (existing) {
            existing.state = data.state;
            existing.updatedAt = new Date();
            mockDb.set(where.threadId, existing);
          }
          return Promise.resolve(existing);
        }),
        delete: jest.fn().mockImplementation(({ where }) => {
          mockDb.delete(where.threadId);
          return Promise.resolve({ count: 1 });
        }),
        count: jest.fn().mockImplementation(() => {
          return Promise.resolve(mockDb.size);
        }),
      }
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationGraphService,
        {
          provide: VectorSearchService,
          useValue: mockVectorSearch,
        },
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<ConversationGraphService>(ConversationGraphService);
    vectorSearchService = module.get(VectorSearchService);
    prismaService = module.get(PrismaService);

    // Call the init method directly since Test module doesn't trigger it
    service.onModuleInit();
  });

  describe('processMessage', () => {
    it('should return greeting for new conversation', async () => {
      const result = await service.processMessage('test-thread-1', 'Olá');

      expect(result).toBeDefined();
      expect(result.sessionId).toBe('test-thread-1');
      expect(result.response).toContain('Olá');
    });

    it('should extract name from message', async () => {
      // Test with a clearer name pattern
      const result = await service.processMessage(
        'test-thread-2',
        'Oi, sou João',
      );

      expect(result).toBeDefined();
      // The response should contain the name if extracted
      expect(result.response).toContain('João');
    });

    it('should move to discovery after name extraction', async () => {
      // First message with name
      const result1 = await service.processMessage(
        'test-thread-3',
        'Oi, sou Maria',
      );
      // The greeting node should have extracted the name
      expect(result1.response).toContain('Maria');

      // Second message with preferences
      const result2 = await service.processMessage(
        'test-thread-3',
        'Quero um SUV até 80 mil',
      );
      expect(result2.profile?.bodyType).toBe('suv');
      expect(result2.profile?.budget).toBe(80000);
    });

    it('should handle vehicle search when profile is complete', async () => {
      vectorSearchService.searchSemantic.mockResolvedValue([
        {
          id: 'vehicle-1',
          make: 'Toyota',
          model: 'Corolla',
          yearModel: 2022,
          price: 95000,
          mileage: 30000,
          bodyType: 'Sedan',
          condition: 'USED',
          aiTags: ['Econômico', 'Confortável'],
          score: 0.85,
        },
      ]);

      // Start conversation
      await service.processMessage('test-thread-4', 'Oi, sou Pedro');

      // Provide preferences
      const _result = await service.processMessage(
        'test-thread-4',
        'Quero um sedan até 100 mil',
      );

      expect(vectorSearchService.searchSemantic).toHaveBeenCalled();
    });

    it('should handle handoff request', async () => {
      await service.processMessage('test-thread-5', 'Oi, sou Ana');
      const result = await service.processMessage(
        'test-thread-5',
        'Quero falar com um vendedor',
      );

      expect(result.response).toContain('consultor');
      expect(result.suggestedActions).toContain('HANDOFF_HUMAN');
    });

    it('should handle financing intent after recommendations', async () => {
      vectorSearchService.searchSemantic.mockResolvedValue([
        {
          id: 'vehicle-1',
          make: 'Toyota',
          model: 'Corolla',
          yearModel: 2022,
          price: 95000,
          mileage: 30000,
          bodyType: 'Sedan',
          condition: 'USED',
          aiTags: [],
          score: 0.85,
        },
      ]);

      // Start conversation with name
      await service.processMessage('test-thread-6', 'Oi, sou Carlos');
      // Provide preferences to trigger search
      await service.processMessage(
        'test-thread-6',
        'Quero um sedan até 100 mil',
      );
      // Now ask about financing
      const result = await service.processMessage(
        'test-thread-6',
        'Quero financiar',
      );

      // Should either be in financing or recommendation node handling financing
      expect(['financing', 'recommendation']).toContain(result.currentNode);
    });
  });

  describe('session management', () => {
    it('should create new session for new thread', async () => {
      await service.processMessage('new-thread', 'Olá');

      const session = await service.getSession('new-thread');
      expect(session).toBeDefined();
      expect(session?.threadId).toBe('new-thread');
    });

    it('should reuse existing session', async () => {
      await service.processMessage('reuse-thread', 'Olá');
      await service.processMessage('reuse-thread', 'Meu nome é Test');

      const session = await service.getSession('reuse-thread');
      const messages = session?.state.messages || [];
      expect(messages.length).toBeGreaterThan(2);
    });

    it('should clear session', async () => {
      await service.processMessage('clear-thread', 'Olá');
      await service.clearSession('clear-thread');

      const session = await service.getSession('clear-thread');
      expect(session).toBeUndefined();
    });

    it('should count active sessions', async () => {
      const initialCount = await service.getActiveSessionsCount();

      await service.processMessage('user-1', 'Hi');
      await service.processMessage('user-2', 'Hello');

      expect(await service.getActiveSessionsCount()).toBe(initialCount + 2);

      await service.clearSession('user-1');
      expect(await service.getActiveSessionsCount()).toBe(initialCount + 1);
    });

    it('should set vehicle as lead when interestedVehicle is provided', async () => {
      const interestedVehicle = {
        id: 'vehicle-123',
        make: 'Toyota',
        model: 'Corolla',
        yearModel: 2023,
        price: 120000,
        mileage: 15000,
        bodyType: 'Sedan',
      };

      const result = await service.processMessage(
        'lead-thread',
        'Estou interessado no Toyota Corolla 2023',
        { interestedVehicle },
      );

      const session = await service.getSession('lead-thread');
      expect(session?.state.recommendations).toHaveLength(1);
      expect(session?.state.recommendations[0].vehicleId).toBe('vehicle-123');
      expect(session?.state.recommendations[0].matchScore).toBe(100);

      // Verify lead context in profile
      expect(session?.state.profile).toBeDefined();
      expect(session?.state.profile._lastShownVehicles).toHaveLength(1);
      expect(session?.state.profile._lastShownVehicles?.[0].vehicleId).toBe(
        'vehicle-123',
      );

      // Response should mention the vehicle
      expect(result.response).toContain('Toyota');
      expect(result.response).toContain('Corolla');
    });
  });
});
