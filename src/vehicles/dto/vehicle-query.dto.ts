import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class VehicleQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  make?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  model?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(99999999)
  priceMin?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(99999999)
  priceMax?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
