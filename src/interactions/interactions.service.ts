import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInteractionDto } from './dto/create-interaction.dto';

@Injectable()
export class InteractionsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Salvar um veículo como favorito
   * Usa sessionId para usuários anônimos
   */
  async saveVehicle(vehicleId: string, sessionId: string) {
    // Verificar se o veículo existe
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
    });

    if (!vehicle) {
      throw new NotFoundException(`Veículo ${vehicleId} não encontrado`);
    }

    // Verificar se já está salvo (evitar duplicatas)
    const existing = await this.prisma.userInteraction.findFirst({
      where: {
        vehicleId,
        type: 'SAVED',
        metadata: {
          path: ['sessionId'],
          equals: sessionId,
        },
      },
    });

    if (existing) {
      return { message: 'Veículo já está salvo', interaction: existing };
    }

    // Criar interação
    const interaction = await this.prisma.userInteraction.create({
      data: {
        vehicleId,
        type: 'SAVED',
        metadata: { sessionId },
      },
    });

    return { message: 'Veículo salvo com sucesso', interaction };
  }

  /**
   * Remover veículo dos favoritos
   */
  async unsaveVehicle(vehicleId: string, sessionId: string) {
    const result = await this.prisma.userInteraction.deleteMany({
      where: {
        vehicleId,
        type: 'SAVED',
        metadata: {
          path: ['sessionId'],
          equals: sessionId,
        },
      },
    });

    if (result.count === 0) {
      throw new NotFoundException('Veículo não estava nos favoritos');
    }

    return { message: 'Veículo removido dos favoritos', deleted: result.count };
  }

  /**
   * Listar todos os veículos salvos por uma sessão
   */
  async getSavedVehicles(sessionId: string) {
    const interactions = await this.prisma.userInteraction.findMany({
      where: {
        type: 'SAVED',
        metadata: {
          path: ['sessionId'],
          equals: sessionId,
        },
      },
      include: {
        vehicle: {
          include: {
            media: true,
            dealer: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return interactions.map((i) => i.vehicle);
  }

  /**
   * Verificar se um veículo está salvo
   */
  async isVehicleSaved(vehicleId: string, sessionId: string): Promise<boolean> {
    const existing = await this.prisma.userInteraction.findFirst({
      where: {
        vehicleId,
        type: 'SAVED',
        metadata: {
          path: ['sessionId'],
          equals: sessionId,
        },
      },
    });

    return !!existing;
  }

  /**
   * Obter múltiplos veículos por IDs (para comparação)
   */
  async getVehiclesByIds(vehicleIds: string[]) {
    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        id: { in: vehicleIds },
      },
      include: {
        media: true,
        dealer: true,
      },
    });

    return vehicles;
  }

  // ============ COMPARAÇÃO - Lista Persistida ============

  private readonly MAX_COMPARE_ITEMS = 3;

  /**
   * Adicionar veículo à lista de comparação
   */
  async addToComparison(vehicleId: string, sessionId: string) {
    // Verificar se o veículo existe
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
    });

    if (!vehicle) {
      throw new NotFoundException(`Veículo ${vehicleId} não encontrado`);
    }

    // Verificar quantos já estão na comparação
    const currentCount = await this.prisma.userInteraction.count({
      where: {
        type: 'COMPARISON_ADD',
        metadata: {
          path: ['sessionId'],
          equals: sessionId,
        },
      },
    });

    if (currentCount >= this.MAX_COMPARE_ITEMS) {
      return {
        success: false,
        message: `Máximo de ${this.MAX_COMPARE_ITEMS} veículos para comparar`,
        currentCount,
      };
    }

    // Verificar se já está na comparação
    const existing = await this.prisma.userInteraction.findFirst({
      where: {
        vehicleId,
        type: 'COMPARISON_ADD',
        metadata: {
          path: ['sessionId'],
          equals: sessionId,
        },
      },
    });

    if (existing) {
      return { success: true, message: 'Veículo já está na comparação' };
    }

    // Adicionar à comparação
    await this.prisma.userInteraction.create({
      data: {
        vehicleId,
        type: 'COMPARISON_ADD',
        metadata: { sessionId },
      },
    });

    return { success: true, message: 'Veículo adicionado à comparação' };
  }

  /**
   * Remover veículo da lista de comparação
   */
  async removeFromComparison(vehicleId: string, sessionId: string) {
    const result = await this.prisma.userInteraction.deleteMany({
      where: {
        vehicleId,
        type: 'COMPARISON_ADD',
        metadata: {
          path: ['sessionId'],
          equals: sessionId,
        },
      },
    });

    return {
      success: result.count > 0,
      message:
        result.count > 0
          ? 'Removido da comparação'
          : 'Veículo não estava na comparação',
    };
  }

  /**
   * Obter lista de comparação com veículos completos
   */
  async getComparisonList(sessionId: string) {
    const interactions = await this.prisma.userInteraction.findMany({
      where: {
        type: 'COMPARISON_ADD',
        metadata: {
          path: ['sessionId'],
          equals: sessionId,
        },
      },
      include: {
        vehicle: {
          include: {
            media: true,
            dealer: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return interactions.map((i) => i.vehicle);
  }

  /**
   * Limpar lista de comparação
   */
  async clearComparison(sessionId: string) {
    const result = await this.prisma.userInteraction.deleteMany({
      where: {
        type: 'COMPARISON_ADD',
        metadata: {
          path: ['sessionId'],
          equals: sessionId,
        },
      },
    });

    return { success: true, deleted: result.count };
  }

  /**
   * Registrar visualização de veículo
   */
  async recordView(vehicleId: string, sessionId: string) {
    return this.prisma.userInteraction.create({
      data: {
        vehicleId,
        type: 'VIEWED',
        metadata: { sessionId },
      },
    });
  }

  /**
   * Registrar contato com vendedor
   */
  async recordContact(vehicleId: string, sessionId: string) {
    return this.prisma.userInteraction.create({
      data: {
        vehicleId,
        type: 'CONTACTED',
        metadata: { sessionId },
      },
    });
  }

  // ============ CRUD Genérico (mantido para compatibilidade) ============

  async create(createInteractionDto: CreateInteractionDto) {
    return this.prisma.userInteraction.create({
      data: {
        vehicleId: createInteractionDto.vehicleId,
        userId: createInteractionDto.userId,
        type: createInteractionDto.type,
      },
    });
  }

  async findAll() {
    return this.prisma.userInteraction.findMany({
      include: {
        vehicle: true,
        user: true,
      },
    });
  }

  async findOne(id: string) {
    return this.prisma.userInteraction.findUnique({
      where: { id },
      include: {
        vehicle: true,
        user: true,
      },
    });
  }

  async remove(id: string) {
    return this.prisma.userInteraction.delete({
      where: { id },
    });
  }
}
