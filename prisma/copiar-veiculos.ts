/**
 * Guarda uma cópia dos carros antes de publicar estoque, para poder conferir ou desfazer.
 *
 *   npx ts-node prisma/copiar-veiculos.ts <arquivo.json>
 */
import { PrismaClient } from '@prisma/client';
import { dirname } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import 'dotenv/config';

async function main(): Promise<void> {
  const destino = process.argv[2];
  if (!destino) throw new Error('Informe o arquivo de destino.');
  const prisma = new PrismaClient();
  try {
    const carros = await prisma.vehicle.findMany({
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
    });
    const lojas = await prisma.dealer.findMany({
      select: { id: true, name: true, contactInfo: true },
    });
    mkdirSync(dirname(destino), { recursive: true });
    writeFileSync(destino, JSON.stringify({ lojas, carros }, null, 1));
    console.log(`Cópia gravada: ${carros.length} carros em ${destino}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
