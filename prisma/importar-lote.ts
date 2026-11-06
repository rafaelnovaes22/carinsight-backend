/**
 * Publica um lote de carros recebidos por WhatsApp.
 *
 *   npx ts-node prisma/importar-lote.ts prisma/lotes/<arquivo>.json           simula, não grava
 *   npx ts-node prisma/importar-lote.ts prisma/lotes/<arquivo>.json --apply   grava em DATABASE_URL
 *
 * Só altera carros desta loja e deste lote. Rodar de novo atualiza em vez de duplicar.
 * Antes de gravar, confere se cada foto e vídeo já está publicado no site.
 */
import { Prisma, PrismaClient, UserRole } from '@prisma/client';
import { randomBytes } from 'crypto';
import { readFileSync } from 'fs';
import 'dotenv/config';
import { EmbeddingService } from '../src/ai/embeddings/embedding.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import {
  carrosComFoto,
  dadosDoVeiculo,
  Lote,
  midiaDoVeiculo,
  validarLote,
} from '../src/stock-sync/lote';

// São centenas de fotos em um banco remoto: o limite padrão de 5 s desfaria a gravação.
const TRANSACAO = { maxWait: 15_000, timeout: 120_000 };

const slug = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export async function conferirMidia(lote: Lote): Promise<void> {
  const urls = carrosComFoto(lote).flatMap((carro) => [
    ...carro.fotos,
    ...(carro.video ? [carro.video] : []),
  ]);
  const ruins: string[] = [];
  for (const url of urls) {
    const resposta = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(30_000),
    });
    if (!resposta.ok) ruins.push(`${resposta.status} ${url}`);
  }
  if (ruins.length > 0) {
    throw new Error(
      `Mídia que não está no ar (${ruins.length}):\n${ruins.slice(0, 5).join('\n')}`,
    );
  }
  console.log(`Mídia conferida no site: ${urls.length} arquivos.`);
}

/** A conta é só um cadastro para ligar os carros à loja: a senha é aleatória e descartada. */
async function lojaDoLote(prisma: PrismaClient, nome: string) {
  const existente = await prisma.dealer.findFirst({ where: { name: nome } });
  if (existente) return existente;
  return prisma.dealer.create({
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

async function main(): Promise<void> {
  const [arquivo] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const aplicar = process.argv.includes('--apply');
  if (!arquivo) throw new Error('Informe o arquivo do lote.');

  const lote = JSON.parse(readFileSync(arquivo, 'utf8')) as Lote;
  const erros = validarLote(lote);
  if (erros.length > 0) throw new Error(`Lote inválido:\n${erros.join('\n')}`);

  const prontos = carrosComFoto(lote);
  console.log(`Loja: ${lote.loja}`);
  for (const carro of lote.carros) {
    const situacao =
      carro.fotos.length === 0
        ? 'FICA DE FORA, sem foto'
        : `${carro.fotos.length} fotos`;
    console.log(
      `  ${dadosDoVeiculo(carro, lote.loja).title} | R$ ${carro.price} | ${carro.km} km | ${situacao}`,
    );
  }
  await conferirMidia(lote);

  if (!aplicar) {
    console.log('\nSimulação: nada foi gravado. Use --apply para gravar.');
    return;
  }
  if (!process.env.DATABASE_URL) throw new Error('--apply exige DATABASE_URL.');
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      '--apply exige OPENAI_API_KEY para atualizar a busca semântica.',
    );
  }

  const prisma = new PrismaClient();
  try {
    const loja = await lojaDoLote(prisma, lote.loja);
    const atuais = await prisma.vehicle.findMany({
      where: { dealerId: loja.id },
    });
    const idDoLote = (specs: Prisma.JsonValue) =>
      (specs as { source?: { id?: string } } | null)?.source?.id;

    const tocados = await prisma.$transaction(async (tx) => {
      const ids: string[] = [];
      for (const carro of prontos) {
        const dados = {
          ...dadosDoVeiculo(carro, lote.loja),
        } as Omit<Prisma.VehicleUncheckedCreateInput, 'dealerId'>;
        const atual = atuais.find(
          (v) => idDoLote(v.technicalSpecs) === carro.id,
        );
        const salvo = atual
          ? await tx.vehicle.update({
              where: { id: atual.id },
              data: {
                ...dados,
                media: { deleteMany: {}, create: midiaDoVeiculo(carro) },
              },
            })
          : await tx.vehicle.create({
              data: {
                ...dados,
                dealerId: loja.id,
                media: { create: midiaDoVeiculo(carro) },
              },
            });
        ids.push(salvo.id);
      }
      return ids;
    }, TRANSACAO);
    console.log(`\nGravado: ${tocados.length} carros.`);

    const embeddings = new EmbeddingService(prisma as unknown as PrismaService);
    const falhas: string[] = [];
    for (const id of tocados) {
      if (!(await embeddings.syncVehicleEmbedding(id))) falhas.push(id);
    }
    if (falhas.length > 0) {
      throw new Error(
        `Carros gravados, mas a busca semântica falhou em ${falhas.length}. Rode de novo.`,
      );
    }
    console.log('Busca semântica atualizada.');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((erro: unknown) => {
    console.error(erro instanceof Error ? erro.message : erro);
    process.exit(1);
  });
}
