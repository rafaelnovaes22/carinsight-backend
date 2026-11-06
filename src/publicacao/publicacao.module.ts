import {
  Body,
  Controller,
  Get,
  HttpCode,
  Module,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PublicacaoGuard } from './publicacao.guard';
import type { EntradaCarro } from './publicacao.service';
import { PublicacaoService } from './publicacao.service';

@Controller('publicacao')
@UseGuards(PublicacaoGuard)
export class PublicacaoController {
  constructor(private readonly servico: PublicacaoService) {}

  @Get('copia')
  copia() {
    return this.servico.copia();
  }

  @Post('carro')
  @HttpCode(200)
  carro(@Body() corpo: EntradaCarro) {
    return this.servico.salvarCarro(corpo);
  }

  @Post('situacao')
  @HttpCode(200)
  situacao(@Body() corpo: { loja: string; ids: string[]; status: string }) {
    return this.servico.mudarSituacao(corpo);
  }

  @Post('contato')
  @HttpCode(200)
  contato(@Body() corpo: { loja: string; contactInfo: object }) {
    return this.servico.mudarContato(corpo);
  }
}

@Module({
  imports: [PrismaModule, AiModule],
  controllers: [PublicacaoController],
  providers: [PublicacaoService, PublicacaoGuard],
})
export class PublicacaoModule {}
