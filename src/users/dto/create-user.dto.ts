import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  IsEnum,
  IsObject,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum UserRole {
  ADMIN = 'ADMIN',
  DEALER = 'DEALER',
  CUSTOMER = 'CUSTOMER',
}

export class CreateUserDto {
  @ApiProperty({ example: 'usuario@email.com' })
  @IsEmail({}, { message: 'Email inválido' })
  email: string;

  @ApiProperty({ example: 'senhaSegura123', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Senha deve ter no mínimo 8 caracteres' })
  @MaxLength(100)
  password: string;

  @ApiProperty({ example: 'João Silva' })
  @IsString()
  @MinLength(2, { message: 'Nome deve ter no mínimo 2 caracteres' })
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ enum: UserRole, default: UserRole.CUSTOMER })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({
    description: 'Preferências do usuário (quiz results, AI preferences)',
    example: { preferredBodyType: 'SUV', budget: 100000 },
  })
  @IsOptional()
  @IsObject()
  preferences?: Record<string, unknown>;
}
