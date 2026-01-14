import { IsString, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum InteractionType {
    SAVED = 'SAVED',
    VIEWED = 'VIEWED',
    CONTACTED = 'CONTACTED',
    COMPARISON_ADD = 'COMPARISON_ADD',
}

export class CreateInteractionDto {
    @ApiProperty({ required: false, description: 'ID do usuário (opcional para anônimos)' })
    @IsOptional()
    @IsString()
    userId?: string;

    @ApiProperty({ description: 'ID do veículo' })
    @IsString()
    vehicleId: string;

    @ApiProperty({ enum: InteractionType, description: 'Tipo de interação' })
    @IsEnum(InteractionType)
    type: InteractionType;
}
