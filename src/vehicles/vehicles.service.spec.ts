import { Test, TestingModule } from '@nestjs/testing';
import { VehiclesService } from './vehicles.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

const mockPrismaService = {
  vehicle: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
};

const mockVehicle = {
  id: '1',
  title: 'Carro Teste',
  price: 50000,
  mileage: 10000,
  yearFab: 2024,
  aiTags: ['Baixa Quilometragem', 'Seminovo'],
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
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a vehicle with generated AI tags', async () => {
      const createDto: any = {
        title: 'Carro Teste',
        mileage: 10000,
        yearFab: 2024,
        technicalSpecs: {},
        inspectionReport: {},
      };

      mockPrismaService.vehicle.create.mockResolvedValue({
        id: '1',
        ...createDto,
        aiTags: ['Baixa Quilometragem', 'Seminovo'],
      });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const result = await service.create(createDto);

      expect(prisma.vehicle.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            aiTags: expect.arrayContaining(['Baixa Quilometragem', 'Seminovo']),
          }),
        }),
      );
      expect(result.aiTags).toEqual(['Baixa Quilometragem', 'Seminovo']);
    });
  });

  describe('findAll', () => {
    it('should return paginated vehicles', async () => {
      mockPrismaService.vehicle.findMany.mockResolvedValue([mockVehicle]);
      mockPrismaService.vehicle.count.mockResolvedValue(1);

      const result = await service.findAll();

      expect(result).toEqual({
        data: [mockVehicle],
        meta: {
          total: 1,
          page: 1,
          limit: 20,
          totalPages: 1,
        },
      });
      expect(prisma.vehicle.findMany).toHaveBeenCalled();
      expect(prisma.vehicle.count).toHaveBeenCalled();
    });

    it('should apply filters when provided', async () => {
      mockPrismaService.vehicle.findMany.mockResolvedValue([mockVehicle]);
      mockPrismaService.vehicle.count.mockResolvedValue(1);

      await service.findAll({ make: 'Toyota', priceMin: 10000 });

      expect(prisma.vehicle.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            make: { equals: 'Toyota', mode: 'insensitive' },
            price: expect.objectContaining({ gte: 10000 }),
          }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('should return a vehicle if found', async () => {
      mockPrismaService.vehicle.findUnique.mockResolvedValue(mockVehicle);
      const result = await service.findOne('1');
      expect(result).toEqual(mockVehicle);
    });

    it('should throw NotFoundException if not found', async () => {
      mockPrismaService.vehicle.findUnique.mockResolvedValue(null);
      await expect(service.findOne('999')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update a vehicle', async () => {
      const updateDto = { price: 45000 };
      const updatedVehicle = { ...mockVehicle, ...updateDto };

      mockPrismaService.vehicle.findUnique.mockResolvedValue(mockVehicle);
      mockPrismaService.vehicle.update.mockResolvedValue(updatedVehicle);

      const result = await service.update('1', updateDto);
      expect(result).toEqual(updatedVehicle);
    });

    it('should throw NotFoundException if vehicle does not exist', async () => {
      mockPrismaService.vehicle.findUnique.mockResolvedValue(null);
      await expect(service.update('999', {})).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('should remove a vehicle', async () => {
      // Must mock findUnique to return the vehicle first (remove checks if exists)
      mockPrismaService.vehicle.findUnique.mockResolvedValue(mockVehicle);
      mockPrismaService.vehicle.delete.mockResolvedValue(mockVehicle);

      const result = await service.remove('1');
      expect(result).toEqual(mockVehicle);
      expect(prisma.vehicle.findUnique).toHaveBeenCalledWith({ where: { id: '1' } });
      expect(prisma.vehicle.delete).toHaveBeenCalledWith({ where: { id: '1' } });
    });

    it('should throw NotFoundException if vehicle does not exist', async () => {
      mockPrismaService.vehicle.findUnique.mockResolvedValue(null);
      await expect(service.remove('999')).rejects.toThrow(NotFoundException);
    });
  });
});
