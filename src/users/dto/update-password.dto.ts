import { IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePasswordDto {
  @ApiProperty({ example: 'senhaAtual123' })
  @IsString()
  @MinLength(1, { message: 'Senha atual é obrigatória' })
  currentPassword: string;

  @ApiProperty({ example: 'novaSenha456', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Nova senha deve ter no mínimo 8 caracteres' })
  @MaxLength(100)
  newPassword: string;
}
