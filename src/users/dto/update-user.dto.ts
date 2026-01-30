import {
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  IsObject,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'João Silva Atualizado' })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Nome deve ter no mínimo 2 caracteres' })
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({
    description: 'Preferências do usuário',
    example: { preferredBodyType: 'Sedan', budget: 150000 },
  })
  @IsOptional()
  @IsObject()
  preferences?: Record<string, unknown>;
}
