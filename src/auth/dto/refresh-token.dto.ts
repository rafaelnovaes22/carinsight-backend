import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh token para renovar o access token' })
  @IsString()
  refreshToken: string;
}
