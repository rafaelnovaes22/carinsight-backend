import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { UsersService } from '../users.service';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt');

describe('UsersService', () => {
  let service: UsersService;
  let prismaService: jest.Mocked<PrismaService>;

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    passwordHash: 'hashed-password',
    name: 'Test User',
    role: 'CUSTOMER',
    preferences: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockPrismaService = {
      user: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      dealer: {
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
      vehicle: {
        count: jest.fn(),
      },
      userInteraction: {
        deleteMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prismaService = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new user', async () => {
      prismaService.user.findUnique.mockResolvedValue(null);
      prismaService.user.create.mockResolvedValue(mockUser);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');

      const result = await service.create({
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
      });

      expect(result.email).toBe('test@example.com');
      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 12);
    });

    it('should throw ConflictException if email exists', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockUser);

      await expect(
        service.create({
          email: 'test@example.com',
          password: 'password123',
          name: 'Test User',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll', () => {
    it('should return paginated users', async () => {
      prismaService.user.findMany.mockResolvedValue([mockUser]);
      prismaService.user.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
    });

    it('should filter by role', async () => {
      prismaService.user.findMany.mockResolvedValue([mockUser]);
      prismaService.user.count.mockResolvedValue(1);

      await service.findAll({ role: 'CUSTOMER' });

      expect(prismaService.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ role: 'CUSTOMER' }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('should return user by id', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.findOne('user-123');

      expect(result.id).toBe('user-123');
    });

    it('should throw NotFoundException if user not found', async () => {
      prismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.findOne('invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update user', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockUser);
      prismaService.user.update.mockResolvedValue({
        ...mockUser,
        name: 'Updated Name',
      });

      const result = await service.update('user-123', { name: 'Updated Name' });

      expect(result.name).toBe('Updated Name');
    });

    it('should throw NotFoundException if user not found', async () => {
      prismaService.user.findUnique.mockResolvedValue(null);

      await expect(
        service.update('invalid-id', { name: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updatePassword', () => {
    it('should update password with valid current password', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hashed-password');
      prismaService.user.update.mockResolvedValue(mockUser);

      const result = await service.updatePassword('user-123', {
        currentPassword: 'oldPassword',
        newPassword: 'newPassword123',
      });

      expect(result.message).toBe('Senha atualizada com sucesso');
    });

    it('should throw BadRequestException with wrong current password', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.updatePassword('user-123', {
          currentPassword: 'wrongPassword',
          newPassword: 'newPassword123',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove', () => {
    it('should remove user without dealer profile', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockUser);
      prismaService.dealer.findUnique.mockResolvedValue(null);
      prismaService.userInteraction.deleteMany.mockResolvedValue({ count: 0 });
      prismaService.user.delete.mockResolvedValue(mockUser);

      const result = await service.remove('user-123');

      expect(result.message).toBe('Usuário removido com sucesso');
    });

    it('should throw NotFoundException if user not found', async () => {
      prismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.remove('invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if dealer has vehicles', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockUser);
      prismaService.dealer.findUnique.mockResolvedValue({ id: 'dealer-123' });
      prismaService.vehicle.count.mockResolvedValue(5);

      await expect(service.remove('user-123')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
