import { Type } from 'class-transformer';
import {
  IsEmail,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class DealerContactInfoDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  whatsapp?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;
}

export class CreateDealerDto {
  @IsUUID()
  userId: string;

  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name: string;

  @IsObject()
  @ValidateNested()
  @Type(() => DealerContactInfoDto)
  contactInfo: DealerContactInfoDto;
}
