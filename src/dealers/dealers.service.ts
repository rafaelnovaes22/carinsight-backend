import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDealerDto } from './dto/create-dealer.dto';
import { UpdateDealerDto } from './dto/update-dealer.dto';

@Injectable()
export class DealersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateDealerDto): Promise<unknown> {
    await this.requireDealerUser(dto.userId);
    const existing = await this.prisma.dealer.findUnique({
      where: { userId: dto.userId },
    });
    if (existing)
      throw new ConflictException('Este usuário já possui uma concessionária');
    return this.prisma.dealer.create({
      data: this.writeFields(dto),
      select: dealerPublicFields,
    });
  }

  findAll(): Promise<unknown[]> {
    return this.prisma.dealer.findMany({
      select: dealerPublicFields,
      orderBy: { name: 'asc' },
      take: 100,
    });
  }

  async findOne(id: string): Promise<unknown> {
    const dealer = await this.prisma.dealer.findUnique({
      where: { id },
      select: dealerPublicFields,
    });
    if (!dealer)
      throw new NotFoundException(`Concessionária ${id} não encontrada`);
    return dealer;
  }

  async update(id: string, dto: UpdateDealerDto): Promise<unknown> {
    await this.findOne(id);
    if (dto.userId) await this.requireDealerUser(dto.userId);
    return this.prisma.dealer.update({
      where: { id },
      data: {
        ...dto,
        contactInfo: dto.contactInfo ? { ...dto.contactInfo } : undefined,
      },
      select: dealerPublicFields,
    });
  }

  async remove(id: string): Promise<unknown> {
    await this.findOne(id);
    try {
      return await this.prisma.dealer.delete({
        where: { id },
        select: dealerPublicFields,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new ConflictException(
          'Remova ou transfira os veículos antes de excluir a concessionária',
        );
      }
      throw error;
    }
  }

  private async requireDealerUser(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !['DEALER', 'ADMIN'].includes(user.role)) {
      throw new NotFoundException(
        `Usuário ${userId} deve existir com perfil DEALER ou ADMIN`,
      );
    }
  }

  private writeFields(dto: CreateDealerDto): Prisma.DealerUncheckedCreateInput {
    return {
      userId: dto.userId,
      name: dto.name,
      contactInfo: { ...dto.contactInfo },
    };
  }
}

const dealerPublicFields = {
  id: true,
  name: true,
  contactInfo: true,
  verificationStatus: true,
} satisfies Prisma.DealerSelect;
