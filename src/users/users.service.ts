import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdatePasswordDto } from './dto/update-password.dto';
import { Prisma } from '@prisma/client';

interface FindAllOptions {
  role?: string;
  search?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private readonly SALT_ROUNDS = 12;

  constructor(private prisma: PrismaService) {}

  async create(dto: CreateUserDto) {
    this.logger.log(`Creating user: ${dto.email}`);

    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email já cadastrado');
    }

    const passwordHash = await bcrypt.hash(dto.password, this.SALT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        name: dto.name,
        role: dto.role || 'CUSTOMER',
        preferences: dto.preferences as Prisma.InputJsonValue,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        preferences: true,
        createdAt: true,
      },
    });

    return user;
  }

  async findAll(options: FindAllOptions = {}) {
    const { role, search, page = 1, limit = 20 } = options;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {};

    if (role) {
      where.role = role as Prisma.EnumUserRoleFilter;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        preferences: true,
        createdAt: true,
        updatedAt: true,
        dealerProfile: {
          select: {
            id: true,
            name: true,
            verificationStatus: true,
            rating: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(`Usuário com ID ${id} não encontrado`);
    }

    return user;
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        preferences: true,
        createdAt: true,
      },
    });
  }

  async update(id: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw new NotFoundException(`Usuário com ID ${id} não encontrado`);
    }

    const updateData: Prisma.UserUpdateInput = {};

    if (dto.name) {
      updateData.name = dto.name;
    }

    if (dto.preferences !== undefined) {
      updateData.preferences = dto.preferences as Prisma.InputJsonValue;
    }

    return this.prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        preferences: true,
        updatedAt: true,
      },
    });
  }

  async updatePassword(id: string, dto: UpdatePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw new NotFoundException(`Usuário com ID ${id} não encontrado`);
    }

    const isCurrentPasswordValid = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );

    if (!isCurrentPasswordValid) {
      throw new BadRequestException('Senha atual incorreta');
    }

    const newPasswordHash = await bcrypt.hash(dto.newPassword, this.SALT_ROUNDS);

    await this.prisma.user.update({
      where: { id },
      data: { passwordHash: newPasswordHash },
    });

    return { message: 'Senha atualizada com sucesso' };
  }

  async updatePreferences(id: string, preferences: Record<string, unknown>) {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw new NotFoundException(`Usuário com ID ${id} não encontrado`);
    }

    const currentPrefs = (user.preferences as Record<string, unknown>) || {};
    const mergedPrefs = { ...currentPrefs, ...preferences };

    return this.prisma.user.update({
      where: { id },
      data: { preferences: mergedPrefs as Prisma.InputJsonValue },
      select: {
        id: true,
        preferences: true,
        updatedAt: true,
      },
    });
  }

  async remove(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw new NotFoundException(`Usuário com ID ${id} não encontrado`);
    }

    // Check for dealer profile
    const dealer = await this.prisma.dealer.findUnique({
      where: { userId: id },
    });

    if (dealer) {
      // Check for vehicles
      const vehicleCount = await this.prisma.vehicle.count({
        where: { dealerId: dealer.id },
      });

      if (vehicleCount > 0) {
        throw new BadRequestException(
          'Não é possível remover usuário com veículos cadastrados. Remova os veículos primeiro.',
        );
      }

      await this.prisma.dealer.delete({ where: { id: dealer.id } });
    }

    // Delete user interactions
    await this.prisma.userInteraction.deleteMany({ where: { userId: id } });

    await this.prisma.user.delete({ where: { id } });

    return { message: 'Usuário removido com sucesso' };
  }
}
