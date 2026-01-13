import { Injectable } from '@nestjs/common';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class VehiclesService {
  constructor(private prisma: PrismaService) { }

  async create(createVehicleDto: CreateVehicleDto) {
    const { technicalSpecs, inspectionReport, ...data } = createVehicleDto;

    // Auto-generate tags logic could go here
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
        media: true
      }
    });
  }

  async findAll() {
    return this.prisma.vehicle.findMany({
      include: {
        dealer: {
          select: { name: true, verificationStatus: true }
        },
        media: {
          take: 1
        }
      }
    });
  }

  async findOne(id: string) {
    return this.prisma.vehicle.findUnique({
      where: { id },
      include: {
        dealer: true,
        media: true,
      }
    });
  }

  update(id: string, updateVehicleDto: UpdateVehicleDto) {
    // Implementation for update would go here
    return `This action updates a #${id} vehicle`;
  }

  remove(id: string) {
    return this.prisma.vehicle.delete({ where: { id } });
  }

  private generateAiTags(data: any, specs: any): string[] {
    const tags: string[] = [];
    if (data.mileage < 20000) tags.push('Baixa Quilometragem');
    if (data.yearFab >= new Date().getFullYear() - 2) tags.push('Seminovo');
    // More logic using specs...
    return tags;
  }
}
