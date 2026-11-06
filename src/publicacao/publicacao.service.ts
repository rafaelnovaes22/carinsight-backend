import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { randomBytes } from 'crypto';
import { EmbeddingService } from '../ai/embeddings/embedding.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Rotina temporária: publica o estoque por dentro do backend, um carro por chamada, porque a
 * Vercel limita cada chamada a 60 s. Repetir uma chamada atualiza em vez de duplicar.
 */

export interface EntradaCarro {
  loja: string;
  criarLoja?: boolean;
  id?: string;
  dados: Record<string, unknown>;
  midia: { url: string; order: number; type?: string }[];
}

const CAMPOS = [
  'title',
  'make',
  'model',
  'version',
  'yearFab',
  'yearModel',
  'price',
  'mileage',
  'condition',
  'bodyType',
  'technicalSpecs',
  'features',
  'status',
] as const;
const TIPOS_DE_MIDIA = ['IMAGE', 'VIDEO'];
const SITUACOES = ['SOLD', 'RESERVED'];

const slug = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export function lerCarro(entrada: EntradaCarro) {
  const recebidos = entrada?.dados;
  if (!entrada?.loja?.trim() || !recebidos) {
    throw new BadRequestException('loja e dados são obrigatórios');
  }
  if (!(Number(recebidos.price) > 0) || !recebidos.title) {
    throw new BadRequestException('carro sem nome ou preço');
  }
  const midia = entrada.midia;
  if (!Array.isArray(midia) || midia.length === 0) {
    throw new BadRequestException('carro sem foto não entra');
  }
  for (const item of midia) {
    if (!/^https:\/\//.test(item?.url ?? '')) {
      throw new BadRequestException(`mídia inválida: ${item?.url}`);
    }
    if (item.type && !TIPOS_DE_MIDIA.includes(item.type)) {
      throw new BadRequestException(`tipo de mídia inválido: ${item.type}`);
    }
  }
  // Só estes campos entram: quem define a loja do carro é a rotina, não o corpo da chamada.
  const dados: Record<string, unknown> = {};
  for (const campo of CAMPOS) {
    if (recebidos[campo] !== undefined) dados[campo] = recebidos[campo];
  }
  const fonte = (recebidos.technicalSpecs as { source?: { id?: unknown } })
    ?.source?.id;
  return {
    dados,
    midia: midia.map(({ url, order, type }) => ({
      url,
      order,
      type: (type ?? 'IMAGE') as 'IMAGE' | 'VIDEO',
    })),
    fonte: typeof fonte === 'string' ? fonte : null,
  };
}

@Injectable()
export class PublicacaoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingService,
  ) {}

  async copia() {
    const [lojas, carros] = await Promise.all([
      this.prisma.dealer.findMany({
        select: { id: true, name: true, contactInfo: true },
      }),
      this.prisma.vehicle.findMany({
        select: {
          id: true,
          dealerId: true,
          title: true,
          price: true,
          mileage: true,
          status: true,
          technicalSpecs: true,
          features: true,
          media: { select: { url: true, type: true, order: true } },
        },
      }),
    ]);
    const banco = new URL(process.env.DATABASE_URL ?? 'postgresql://sem-banco')
      .hostname;
    return { banco, lojas, carros };
  }

  private async lojaPorNome(nome: string, criar = false) {
    const existente = await this.prisma.dealer.findFirst({
      where: { name: nome },
    });
    if (existente) return existente;
    if (!criar) throw new BadRequestException(`loja não encontrada: ${nome}`);
    return this.prisma.dealer.create({
      data: {
        name: nome,
        contactInfo: {},
        user: {
          create: {
            email: `loja-${slug(nome)}@carinsight.com.br`,
            passwordHash: `desativada-${randomBytes(32).toString('hex')}`,
            name: nome,
            role: UserRole.DEALER,
          },
        },
      },
    });
  }

  async salvarCarro(entrada: EntradaCarro) {
    const { dados, midia, fonte } = lerCarro(entrada);
    const loja = await this.lojaPorNome(entrada.loja, entrada.criarLoja);

    const atual = await this.prisma.vehicle.findFirst({
      where: entrada.id
        ? { id: entrada.id, dealerId: loja.id }
        : fonte
          ? {
              dealerId: loja.id,
              technicalSpecs: { path: ['source', 'id'], equals: fonte },
            }
          : { id: '00000000-0000-0000-0000-000000000000' },
      select: { id: true },
    });
    if (entrada.id && !atual) {
      throw new BadRequestException('carro não pertence a esta loja');
    }

    const salvo = await this.prisma.$transaction(
      (tx) =>
        atual
          ? tx.vehicle.update({
              where: { id: atual.id },
              data: {
                ...dados,
                media: { deleteMany: {}, create: midia },
              } as Prisma.VehicleUncheckedUpdateInput,
            })
          : tx.vehicle.create({
              data: {
                ...dados,
                dealerId: loja.id,
                media: { create: midia },
              } as unknown as Prisma.VehicleUncheckedCreateInput,
            }),
      { maxWait: 10_000, timeout: 40_000 },
    );

    const busca = await this.embeddings.syncVehicleEmbedding(salvo.id);
    return { id: salvo.id, criado: !atual, busca };
  }

  async mudarSituacao(corpo: { loja: string; ids: string[]; status: string }) {
    if (!SITUACOES.includes(corpo?.status) || !Array.isArray(corpo?.ids)) {
      throw new BadRequestException('situação inválida');
    }
    const loja = await this.lojaPorNome(corpo.loja);
    const { count } = await this.prisma.vehicle.updateMany({
      where: { id: { in: corpo.ids }, dealerId: loja.id },
      data: { status: corpo.status as 'SOLD' | 'RESERVED' },
    });
    return { alterados: count };
  }

  async mudarContato(corpo: { loja: string; contactInfo: object }) {
    if (!corpo?.contactInfo || typeof corpo.contactInfo !== 'object') {
      throw new BadRequestException('contato inválido');
    }
    const loja = await this.lojaPorNome(corpo.loja);
    await this.prisma.dealer.update({
      where: { id: loja.id },
      data: { contactInfo: corpo.contactInfo as Prisma.InputJsonObject },
    });
    return { ok: true };
  }
}
