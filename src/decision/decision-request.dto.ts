import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class DecisionConstraintsDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(99999999)
  budgetMax?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  bodyType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  transmission?: string;

  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2100)
  minYear?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2000000)
  maxMileage?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  make?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  model?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  fuelType?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  priorities?: string[];
}

export class DecisionRequestDto {
  @IsString()
  @MaxLength(1500)
  @Matches(/\S/)
  naturalLanguage: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => DecisionConstraintsDto)
  constraints?: DecisionConstraintsDto;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(6)
  limit?: number;
}
