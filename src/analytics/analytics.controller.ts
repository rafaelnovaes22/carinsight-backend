import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { AnalyticsService, AnalyticsReport } from './analytics.service';
import { AnalyticsAuthGuard, BotIngestGuard } from './analytics-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

class IngestMessageDto {
  @IsString()
  @IsIn(['telegram', 'whatsapp', 'web', 'other'])
  platform: string;

  @IsString()
  @MaxLength(128)
  chatId: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  userName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  userText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  botText?: string;

  @IsOptional()
  @IsObject()
  meta?: Record<string, unknown>;
}

/** Relatórios: JWT (ADMIN/DEALER) ou x-api-key do bot (ANALYTICS_API_KEY). */
const ReportThrottle = () =>
  Throttle({
    short: { limit: 2, ttl: 1000 },
    medium: { limit: 10, ttl: 60000 },
    long: { limit: 200, ttl: 3600000 },
  });

@ApiTags('Analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('report')
  @UseGuards(AnalyticsAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DEALER')
  @ReportThrottle()
  @ApiHeader({ name: 'x-api-key', required: false })
  @ApiOperation({ summary: 'Relatório agregado de conversas (JSON)' })
  report(@Query('days') days?: string): Promise<AnalyticsReport> {
    return this.analyticsService.getReport(this.parseDays(days));
  }

  @Get('report/text')
  @UseGuards(AnalyticsAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DEALER')
  @ReportThrottle()
  @ApiHeader({ name: 'x-api-key', required: false })
  @ApiOperation({ summary: 'Relatório em texto pronto para envio' })
  async reportText(@Query('days') days?: string): Promise<{ text: string }> {
    return {
      text: await this.analyticsService.getReportText(this.parseDays(days)),
    };
  }

  /** Ingestão de pares pergunta/resposta do bot externo (Telegram). */
  @Post('ingest')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(BotIngestGuard)
  @ApiHeader({ name: 'x-api-key', required: true })
  @ApiOperation({
    summary: 'Registra mensagem do bot (somente bots com chave)',
  })
  async ingest(@Body() dto: IngestMessageDto): Promise<{ id: string }> {
    return this.analyticsService.ingestMessage(dto);
  }

  private parseDays(raw?: string): number {
    const n = raw === undefined ? 7 : Number(raw);
    return Number.isFinite(n) ? n : 7;
  }
}
