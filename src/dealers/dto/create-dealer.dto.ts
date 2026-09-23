import { IsObject, IsString, IsUUID, MinLength } from 'class-validator';

// Campos de contato são Json livre no Prisma; validação de formato fica na camada de serviço
export class CreateDealerDto {
  @IsUUID()
  userId!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsObject()
  contactInfo!: Record<string, unknown>;
}
