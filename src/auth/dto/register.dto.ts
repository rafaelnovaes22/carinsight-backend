import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  IsEnum,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum RegisterRole {
  CUSTOMER = 'CUSTOMER',
  DEALER = 'DEALER',
}

export class RegisterDto {
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

  @ApiPropertyOptional({ enum: RegisterRole, default: RegisterRole.CUSTOMER })
  @IsOptional()
  @IsEnum(RegisterRole)
  role?: RegisterRole;
}
