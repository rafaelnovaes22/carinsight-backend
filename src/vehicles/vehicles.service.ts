import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

interface VehicleFilters {
  make?: string;
  model?: string;
  priceMin?: number;
  priceMax?: number;
}

@Injectable()
export class VehiclesService {
  constructor(private prisma: PrismaService) { }

  async create(createVehicleDto: CreateVehicleDto) {
    const { technicalSpecs, inspectionReport, ...data } = createVehicleDto;

    const aiTags = this.generateAiTags(data, technicalSpecs);

    return this.prisma.vehicle.create({
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
  }

  async findAll(filters: VehicleFilters = {}) {
    const where: Prisma.VehicleWhereInput = {};

    if (filters.make) where.make = filters.make;
    if (filters.model) where.model = filters.model;

    if (filters.priceMin || filters.priceMax) {
      where.price = {};
      if (filters.priceMin) where.price.gte = filters.priceMin;
      if (filters.priceMax) where.price.lte = filters.priceMax;
    }

    return this.prisma.vehicle.findMany({
      where,
      include: {
        dealer: {
          select: { name: true, verificationStatus: true },
        },
        media: {
          take: 1,
        },
      },
    });
  }

  async findOne(id: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id },
      include: {
        dealer: true,
        media: true,
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

    // In a real scenario, we might want to regenerate AI tags if critical fields change
    // const aiTags = this.generateAiTags({...vehicle, ...data}, ...);

    const updateData: Prisma.VehicleUpdateInput = {
      ...data,
    };

    if (technicalSpecs) {
      updateData.technicalSpecs = technicalSpecs as Prisma.InputJsonValue;
    }

    if (inspectionReport) {
      updateData.inspectionReport = inspectionReport as Prisma.InputJsonValue;
    }

    return this.prisma.vehicle.update({
      where: { id },
      data: updateData,
      include: {
        dealer: true,
        media: true,
      },
    });
  }

  remove(id: string) {
    return this.prisma.vehicle.delete({ where: { id } });
  }

  private generateAiTags(
    data: any,
    _specs: any,
  ): string[] {
    const tags: string[] = [];
    if (data.mileage < 20000) tags.push('Baixa Quilometragem');
    if (data.yearFab >= new Date().getFullYear() - 2) tags.push('Seminovo');
    return tags;
  }
}
