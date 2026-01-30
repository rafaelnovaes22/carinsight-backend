import { Test, TestingModule } from '@nestjs/testing';
import { ConversationGraphService } from '../conversation-graph.service';
import { VectorSearchService } from '../../vector/vector-search.service';
import { PrismaService } from '../../../prisma/prisma.service';

describe('ConversationGraphService', () => {
  let service: ConversationGraphService;
  let vectorSearchMock: jest.Mocked<VectorSearchService>;

  beforeEach(async () => {
    vectorSearchMock = {
      searchSemantic: jest.fn().mockResolvedValue([]),
      getVehicleById: jest.fn(),
      findSimilar: jest.fn(),
      hybridSearch: jest.fn(),
      filterSearch: jest.fn(),
      getSearchStats: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationGraphService,
        {
          provide: VectorSearchService,
          useValue: vectorSearchMock,
        },
        {
          provide: PrismaService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<ConversationGraphService>(ConversationGraphService);
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
      const result = await service.processMessage('test-thread-2', 'Oi, sou João');

      expect(result).toBeDefined();
      // The response should contain the name if extracted
      expect(result.response).toContain('João');
    });

    it('should move to discovery after name extraction', async () => {
      // First message with name
      const result1 = await service.processMessage('test-thread-3', 'Oi, sou Maria');
      // The greeting node should have extracted the name
      expect(result1.response).toContain('Maria');

      // Second message with preferences
      const result2 = await service.processMessage('test-thread-3', 'Quero um SUV até 80 mil');
      expect(result2.profile?.bodyType).toBe('suv');
      expect(result2.profile?.budget).toBe(80000);
    });

    it('should handle vehicle search when profile is complete', async () => {
      vectorSearchMock.searchSemantic.mockResolvedValue([
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
      const result = await service.processMessage('test-thread-4', 'Quero um sedan até 100 mil');

      expect(vectorSearchMock.searchSemantic).toHaveBeenCalled();
    });

    it('should handle handoff request', async () => {
      await service.processMessage('test-thread-5', 'Oi, sou Ana');
      const result = await service.processMessage('test-thread-5', 'Quero falar com um vendedor');

      expect(result.response).toContain('consultor');
      expect(result.suggestedActions).toContain('HANDOFF_HUMAN');
    });

    it('should handle financing intent after recommendations', async () => {
      vectorSearchMock.searchSemantic.mockResolvedValue([
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
      await service.processMessage('test-thread-6', 'Quero um sedan até 100 mil');
      // Now ask about financing
      const result = await service.processMessage('test-thread-6', 'Quero financiar');

      // Should either be in financing or recommendation node handling financing
      expect(['financing', 'recommendation']).toContain(result.currentNode);
    });
  });

  describe('session management', () => {
    it('should create new session for new thread', async () => {
      await service.processMessage('new-thread', 'Olá');
      
      const session = service.getSession('new-thread');
      expect(session).toBeDefined();
      expect(session?.threadId).toBe('new-thread');
    });

    it('should reuse existing session', async () => {
      await service.processMessage('reuse-thread', 'Olá');
      await service.processMessage('reuse-thread', 'Meu nome é Test');

      const session = service.getSession('reuse-thread');
      expect(session?.state.messages.length).toBeGreaterThan(2);
    });

    it('should clear session', async () => {
      await service.processMessage('clear-thread', 'Olá');
      service.clearSession('clear-thread');

      const session = service.getSession('clear-thread');
      expect(session).toBeUndefined();
    });

    it('should count active sessions', async () => {
      const initialCount = service.getActiveSessionsCount();
      
      await service.processMessage('count-thread-1', 'Olá');
      await service.processMessage('count-thread-2', 'Olá');

      expect(service.getActiveSessionsCount()).toBe(initialCount + 2);
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

      const session = service.getSession('lead-thread');
      
      // Should have the vehicle in recommendations
      expect(session?.state.recommendations.length).toBe(1);
      expect(session?.state.recommendations[0].vehicleId).toBe('vehicle-123');
      expect(session?.state.recommendations[0].reasoning).toBe('Veículo que você selecionou');
      
      // Should have extracted preferences from the vehicle
      expect(session?.state.profile._lastShownVehicles).toBeDefined();
      expect(session?.state.profile._lastShownVehicles?.[0].vehicleId).toBe('vehicle-123');
      
      // Response should mention the vehicle
      expect(result.response).toContain('Toyota');
      expect(result.response).toContain('Corolla');
    });
  });
});
