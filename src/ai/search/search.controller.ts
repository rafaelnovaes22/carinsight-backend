import {
  Controller,
  Get,
  Post,
  Query,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { VectorSearchService } from '../vector/vector-search.service';
import { EmbeddingService } from '../embeddings/embedding.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import {
  SearchThrottle,
  AiThrottle,
} from '../../common/decorators/throttle.decorator';

@ApiTags('search')
@Controller('search')
@SearchThrottle() // Rate limiting for search endpoints
export class SearchController {
  constructor(
    private readonly vectorSearch: VectorSearchService,
    private readonly embeddingService: EmbeddingService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Busca semântica de veículos' })
  @ApiQuery({ name: 'q', required: true, description: 'Termo de busca' })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Limite de resultados',
  })
  @ApiQuery({ name: 'priceMin', required: false, type: Number })
  @ApiQuery({ name: 'priceMax', required: false, type: Number })
  @ApiQuery({ name: 'yearMin', required: false, type: Number })
  @ApiQuery({ name: 'yearMax', required: false, type: Number })
  @ApiQuery({ name: 'make', required: false, description: 'Marca do veículo' })
  @ApiQuery({
    name: 'bodyType',
    required: false,
    description: 'Tipo de carroceria',
  })
  @ApiQuery({ name: 'condition', required: false, enum: ['NEW', 'USED'] })
  @ApiResponse({ status: 200, description: 'Lista de veículos relevantes' })
  async search(
    @Query('q') query: string,
    @Query('limit') limit?: number,
    @Query('priceMin') priceMin?: number,
    @Query('priceMax') priceMax?: number,
    @Query('yearMin') yearMin?: number,
    @Query('yearMax') yearMax?: number,
    @Query('make') make?: string,
    @Query('bodyType') bodyType?: string,
    @Query('condition') condition?: 'NEW' | 'USED',
  ) {
    const filters = {
      priceMin,
      priceMax,
      yearMin,
      yearMax,
      make,
      bodyType,
      condition,
    };

    // Remove undefined values
    Object.keys(filters).forEach((key) => {
      if (filters[key as keyof typeof filters] === undefined) {
        delete filters[key as keyof typeof filters];
      }
    });

    return this.vectorSearch.hybridSearch(query, filters, limit || 10);
  }

  @Get('similar/:id')
  @ApiOperation({ summary: 'Encontrar veículos similares' })
  @ApiResponse({ status: 200, description: 'Lista de veículos similares' })
  async findSimilar(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit') limit?: number,
  ) {
    return this.vectorSearch.findSimilar(id, limit || 5);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Estatísticas de busca' })
  @ApiResponse({ status: 200, description: 'Estatísticas do índice de busca' })
  async getStats() {
    return this.vectorSearch.getSearchStats();
  }

  @Post('sync')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth('JWT-auth')
  @AiThrottle() // Stricter limit for AI-intensive operations
  @ApiOperation({
    summary: 'Sincronizar embeddings de todos os veículos (Admin)',
  })
  @ApiResponse({ status: 200, description: 'Resultado da sincronização' })
  async syncAllEmbeddings() {
    return this.embeddingService.syncAllVehicleEmbeddings();
  }

  @Post('sync/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DEALER')
  @ApiBearerAuth('JWT-auth')
  @AiThrottle() // Stricter limit for AI-intensive operations
  @ApiOperation({ summary: 'Sincronizar embedding de um veículo específico' })
  @ApiResponse({ status: 200, description: 'Embedding sincronizado' })
  async syncVehicleEmbedding(@Param('id', ParseUUIDPipe) id: string) {
    const success = await this.embeddingService.syncVehicleEmbedding(id);
    return { success, vehicleId: id };
  }
}
