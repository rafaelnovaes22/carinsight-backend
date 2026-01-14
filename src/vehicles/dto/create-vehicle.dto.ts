import {
  IsString,
  IsInt,
  IsNumber,
  IsOptional,
  IsEnum,
  IsArray,
  Min,
  IsObject,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger'; // Future proofing for Swagger

export enum VehicleCondition {
  NEW = 'NEW',
  USED = 'USED',
}

export class CreateVehicleDto {
  @ApiProperty()
  @IsString()
  dealerId: string;

  @ApiProperty()
  @IsString()
  title: string;

  @ApiProperty()
  @IsString()
  make: string;

  @ApiProperty()
  @IsString()
  model: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  version?: string;

  @ApiProperty()
  @IsInt()
  @Min(1900)
  yearModel: number;

  @ApiProperty()
  @IsInt()
  @Min(1900)
  yearFab: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  price: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  mileage: number;

  @ApiProperty({ enum: VehicleCondition })
  @IsEnum(VehicleCondition)
  condition: VehicleCondition;

  @ApiProperty()
  @IsString()
  bodyType: string;

  @ApiProperty()
  @IsObject()
  technicalSpecs: Record<string, any>;

  @ApiProperty()
  @IsArray()
  @IsString({ each: true })
  features: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  inspectionReport?: Record<string, any>;
}
