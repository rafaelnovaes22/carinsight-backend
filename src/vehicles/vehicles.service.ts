import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

interface VehicleFilters {
  make?: string;
  model?: string;
  priceMin?: number;
  priceMax?: number;
  page?: number;
  limit?: number;
}

@Injectable()
export class VehiclesService {
  private readonly logger = new Logger(VehiclesService.name);

  constructor(private prisma: PrismaService) {}

  async create(createVehicleDto: CreateVehicleDto) {
    const { technicalSpecs, inspectionReport, ...data } = createVehicleDto;

    const aiTags = this.generateAiTags(data, technicalSpecs || {});

    const vehicle = await this.prisma.vehicle.create({
      data: {
        ...data,
        technicalSpecs: technicalSpecs as Prisma.InputJsonValue,
        inspectionReport: inspectionReport as Prisma.InputJsonValue,
        aiTags,
      },
      include: {
        dealer: true,
        media: true,
      },
    });

    // Queue embedding sync (non-blocking)
    this.queueEmbeddingSync(vehicle.id);

    return vehicle;
  }

  async findAll(filters: VehicleFilters = {}) {
    const { page = 1, limit = 20, ...rest } = filters;
    const skip = (page - 1) * limit;

    const where: Prisma.VehicleWhereInput = {};

    if (rest.make) where.make = { equals: rest.make, mode: 'insensitive' };
    if (rest.model) where.model = { contains: rest.model, mode: 'insensitive' };

    if (rest.priceMin || rest.priceMax) {
      where.price = {};
      if (rest.priceMin) where.price.gte = rest.priceMin;
      if (rest.priceMax) where.price.lte = rest.priceMax;
    }

    const [vehicles, total] = await Promise.all([
      this.prisma.vehicle.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          dealer: {
            select: { name: true, verificationStatus: true },
          },
          media: {
            take: 3,
            orderBy: { order: 'asc' },
          },
        },
      }),
      this.prisma.vehicle.count({ where }),
    ]);

    return {
      data: vehicles,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id },
      include: {
        dealer: true,
        media: {
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!vehicle) {
      throw new NotFoundException(`Vehicle with ID ${id} not found`);
    }

    return vehicle;
  }

  async update(id: string, updateVehicleDto: UpdateVehicleDto) {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id } });
    if (!vehicle) {
      throw new NotFoundException(`Vehicle with ID ${id} not found`);
    }

    const { technicalSpecs, inspectionReport, ...data } = updateVehicleDto;

    const updateData: Prisma.VehicleUpdateInput = {
      ...data,
      // Invalidate embedding when vehicle data changes
      embeddingText: null,
    };

    if (technicalSpecs) {
      updateData.technicalSpecs = technicalSpecs as Prisma.InputJsonValue;
    }

    if (inspectionReport) {
      updateData.inspectionReport = inspectionReport as Prisma.InputJsonValue;
    }

    // Regenerate AI tags if relevant fields changed
    if (data.mileage || data.yearFab || technicalSpecs) {
      const mergedData = { ...vehicle, ...data };
      const mergedSpecs = {
        ...(vehicle.technicalSpecs as object),
        ...technicalSpecs,
      };
      updateData.aiTags = this.generateAiTags(mergedData, mergedSpecs);
    }

    const updated = await this.prisma.vehicle.update({
      where: { id },
      data: updateData,
      include: {
        dealer: true,
        media: true,
      },
    });

    // Queue embedding sync (non-blocking)
    this.queueEmbeddingSync(id);

    return updated;
  }

  async remove(id: string) {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id } });
    if (!vehicle) {
      throw new NotFoundException(`Vehicle with ID ${id} not found`);
    }

    return this.prisma.vehicle.delete({ where: { id } });
  }

  private generateAiTags(
    data: {
      mileage?: number;
      yearFab?: number;
      price?: number | Prisma.Decimal;
    },
    specs: Record<string, unknown>,
  ): string[] {
    const tags: string[] = [];
    const currentYear = new Date().getFullYear();

    // Mileage tags
    if (data.mileage !== undefined) {
      if (data.mileage === 0) tags.push('Zero km');
      else if (data.mileage < 20000) tags.push('Baixa Quilometragem');
      else if (data.mileage < 50000) tags.push('Pouco Rodado');
    }

    // Year tags
    if (data.yearFab) {
      if (data.yearFab >= currentYear) tags.push('Novo');
      else if (data.yearFab >= currentYear - 2) tags.push('Seminovo');
      else if (data.yearFab <= currentYear - 15) tags.push('Clássico');
    }

    // Price tags
    if (data.price) {
      const price = Number(data.price);
      if (price < 50000) tags.push('Econômico');
      else if (price > 200000) tags.push('Premium');
    }

    // Specs-based tags
    if (specs.fuel === 'Elétrico' || specs.fuel === 'Híbrido') {
      tags.push('Sustentável');
    }
    if (specs.transmission === 'Automático' || specs.transmission === 'CVT') {
      tags.push('Automático');
    }

    return tags;
  }

  /**
   * Queue embedding sync - runs asynchronously without blocking
   */
  private queueEmbeddingSync(vehicleId: string): void {
    // Use setImmediate to not block the response
    setImmediate(() => {
      // Note: In production, this should use a proper queue (Bull, etc.)
      // For now, we just log that sync is needed
      this.logger.log(`Embedding sync queued for vehicle ${vehicleId}`);
    });
  }
}
