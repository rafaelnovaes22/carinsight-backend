import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Headers,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { InteractionsService } from './interactions.service';
import { CreateInteractionDto } from './dto/create-interaction.dto';

@ApiTags('interactions')
@Controller('interactions')
export class InteractionsController {
  constructor(private readonly interactionsService: InteractionsService) { }

  // ============ FAVORITOS ============

  @Post('save/:vehicleId')
  @ApiOperation({ summary: 'Salvar veículo como favorito' })
  @ApiParam({ name: 'vehicleId', description: 'ID do veículo a salvar' })
  @ApiHeader({ name: 'x-session-id', description: 'ID da sessão do usuário', required: true })
  @ApiResponse({ status: 201, description: 'Veículo salvo com sucesso' })
  @ApiResponse({ status: 404, description: 'Veículo não encontrado' })
  saveVehicle(
    @Param('vehicleId') vehicleId: string,
    @Headers('x-session-id') sessionId: string,
  ) {
    return this.interactionsService.saveVehicle(vehicleId, sessionId);
  }

  @Delete('save/:vehicleId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remover veículo dos favoritos' })
  @ApiParam({ name: 'vehicleId', description: 'ID do veículo a remover' })
  @ApiHeader({ name: 'x-session-id', description: 'ID da sessão do usuário', required: true })
  @ApiResponse({ status: 200, description: 'Veículo removido com sucesso' })
  @ApiResponse({ status: 404, description: 'Veículo não estava nos favoritos' })
  unsaveVehicle(
    @Param('vehicleId') vehicleId: string,
    @Headers('x-session-id') sessionId: string,
  ) {
    return this.interactionsService.unsaveVehicle(vehicleId, sessionId);
  }

  @Get('saved')
  @ApiOperation({ summary: 'Listar veículos salvos' })
  @ApiHeader({ name: 'x-session-id', description: 'ID da sessão do usuário', required: true })
  @ApiResponse({ status: 200, description: 'Lista de veículos salvos' })
  getSavedVehicles(@Headers('x-session-id') sessionId: string) {
    return this.interactionsService.getSavedVehicles(sessionId);
  }

  @Get('saved/:vehicleId/check')
  @ApiOperation({ summary: 'Verificar se veículo está salvo' })
  @ApiParam({ name: 'vehicleId', description: 'ID do veículo a verificar' })
  @ApiHeader({ name: 'x-session-id', description: 'ID da sessão do usuário', required: true })
  @ApiResponse({ status: 200, description: 'Status do veículo' })
  async checkVehicleSaved(
    @Param('vehicleId') vehicleId: string,
    @Headers('x-session-id') sessionId: string,
  ) {
    const isSaved = await this.interactionsService.isVehicleSaved(vehicleId, sessionId);
    return { vehicleId, isSaved };
  }

  // ============ COMPARAÇÃO ============

  @Get('compare')
  @ApiOperation({ summary: 'Obter veículos para comparação por IDs' })
  @ApiQuery({ name: 'ids', description: 'IDs dos veículos separados por vírgula', example: 'id1,id2,id3' })
  @ApiResponse({ status: 200, description: 'Lista de veículos para comparar' })
  async getVehiclesForComparison(@Query('ids') ids: string) {
    const vehicleIds = ids.split(',').filter((id) => id.trim());
    return this.interactionsService.getVehiclesByIds(vehicleIds);
  }

  @Post('compare/:vehicleId')
  @ApiOperation({ summary: 'Adicionar veículo à lista de comparação' })
  @ApiParam({ name: 'vehicleId', description: 'ID do veículo a adicionar' })
  @ApiHeader({ name: 'x-session-id', description: 'ID da sessão do usuário', required: true })
  @ApiResponse({ status: 201, description: 'Adicionado com sucesso' })
  @ApiResponse({ status: 400, description: 'Limite de 3 veículos atingido' })
  addToComparison(
    @Param('vehicleId') vehicleId: string,
    @Headers('x-session-id') sessionId: string,
  ) {
    return this.interactionsService.addToComparison(vehicleId, sessionId);
  }

  @Delete('compare/:vehicleId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remover veículo da lista de comparação' })
  @ApiParam({ name: 'vehicleId', description: 'ID do veículo a remover' })
  @ApiHeader({ name: 'x-session-id', description: 'ID da sessão do usuário', required: true })
  removeFromComparison(
    @Param('vehicleId') vehicleId: string,
    @Headers('x-session-id') sessionId: string,
  ) {
    return this.interactionsService.removeFromComparison(vehicleId, sessionId);
  }

  @Get('compare/list')
  @ApiOperation({ summary: 'Obter lista de comparação da sessão' })
  @ApiHeader({ name: 'x-session-id', description: 'ID da sessão do usuário', required: true })
  @ApiResponse({ status: 200, description: 'Lista de veículos na comparação' })
  getComparisonList(@Headers('x-session-id') sessionId: string) {
    return this.interactionsService.getComparisonList(sessionId);
  }

  @Delete('compare/clear')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Limpar lista de comparação' })
  @ApiHeader({ name: 'x-session-id', description: 'ID da sessão do usuário', required: true })
  clearComparison(@Headers('x-session-id') sessionId: string) {
    return this.interactionsService.clearComparison(sessionId);
  }

  // ============ TRACKING ============

  @Post('view/:vehicleId')
  @ApiOperation({ summary: 'Registrar visualização de veículo' })
  @ApiParam({ name: 'vehicleId', description: 'ID do veículo visualizado' })
  @ApiHeader({ name: 'x-session-id', description: 'ID da sessão do usuário', required: true })
  recordView(
    @Param('vehicleId') vehicleId: string,
    @Headers('x-session-id') sessionId: string,
  ) {
    return this.interactionsService.recordView(vehicleId, sessionId);
  }

  @Post('contact/:vehicleId')
  @ApiOperation({ summary: 'Registrar contato com vendedor' })
  @ApiParam({ name: 'vehicleId', description: 'ID do veículo' })
  @ApiHeader({ name: 'x-session-id', description: 'ID da sessão do usuário', required: true })
  recordContact(
    @Param('vehicleId') vehicleId: string,
    @Headers('x-session-id') sessionId: string,
  ) {
    return this.interactionsService.recordContact(vehicleId, sessionId);
  }

  // ============ CRUD GENÉRICO ============

  @Post()
  @ApiOperation({ summary: 'Criar interação genérica' })
  create(@Body() createInteractionDto: CreateInteractionDto) {
    return this.interactionsService.create(createInteractionDto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar todas as interações' })
  findAll() {
    return this.interactionsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar interação por ID' })
  @ApiParam({ name: 'id', description: 'ID da interação' })
  findOne(@Param('id') id: string) {
    return this.interactionsService.findOne(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remover interação por ID' })
  @ApiParam({ name: 'id', description: 'ID da interação' })
  remove(@Param('id') id: string) {
    return this.interactionsService.remove(id);
  }
}
