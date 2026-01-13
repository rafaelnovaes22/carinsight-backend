import { Test, TestingModule } from '@nestjs/testing';
import { VehiclesService } from './vehicles.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrismaService = {
  vehicle: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

describe('VehiclesService', () => {
  let service: VehiclesService;
  let prisma: typeof mockPrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VehiclesService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<VehiclesService>(VehiclesService);

    prisma = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a vehicle with generated AI tags', async () => {
      const createDto: any = {
        title: 'Carro Teste',
        mileage: 10000, // Should trigger 'Baixa Quilometragem'
        yearFab: new Date().getFullYear(), // Should trigger 'Seminovo'
        technicalSpecs: {},
        inspectionReport: {},
      };

      const expectedTags = ['Baixa Quilometragem', 'Seminovo'];

      mockPrismaService.vehicle.create.mockResolvedValue({
        id: '1',
        ...createDto,
        aiTags: expectedTags,
      });

      const result = await service.create(createDto);

      expect(prisma.vehicle.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          aiTags: expectedTags,
        }),
        include: { dealer: true, media: true },
      });
      expect(result.aiTags).toEqual(expectedTags);
    });
  });
});
