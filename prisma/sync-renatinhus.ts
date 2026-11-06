/**
 * Sincroniza o estoque da Renatinhu's Cars com o site público da loja.
 *
 *   npx ts-node prisma/sync-renatinhus.ts           simula: lê o site e a API pública, não grava nada
 *   npx ts-node prisma/sync-renatinhus.ts --apply   grava no banco de DATABASE_URL (exige OPENAI_API_KEY)
 *
 * Só altera veículos desta loja. Nada é apagado: carro que saiu do site vira SOLD,
 * porque favoritos e interações continuam apontando para ele.
 */
import { Prisma, PrismaClient } from '@prisma/client';
import 'dotenv/config';
import { EmbeddingService } from '../src/ai/embeddings/embedding.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import {
  assertPlausibleListing,
  detectBodyType,
  ExistingVehicle,
  ListedVehicle,
  parseDetail,
  parseListing,
  parseVehicleName,
  planSync,
  SyncPlan,
  VehicleDetail,
} from '../src/stock-sync/renatinhus.parser';

export const DEALER_NAME = "Renatinhu's Cars";
export const LISTING_URL =
  'https://ssl9212.websiteseguro.com/armazena1/atw_site/site/atw6944b/Estoque.aspx?nu=-1';
const detailUrl = (sourceId: string) =>
  `https://armazena.net/atw_site/site/atw6944b/detalhe.aspx?id=${sourceId}`;
const PUBLIC_VEHICLES_URL = 'https://api.carinsight.com.br/vehicles?limit=100';
const USER_AGENT = 'CarInsightStockSync/1.0 (+https://www.carinsight.com.br)';
const DELAY_BETWEEN_REQUESTS_MS = 500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`${response.status} ao buscar ${url}`);
  return response.text();
}

export async function fetchDetails(
  vehicles: ListedVehicle[],
): Promise<Map<string, VehicleDetail>> {
  const details = new Map<string, VehicleDetail>();
  for (const vehicle of vehicles) {
    const detail = parseDetail(
      await fetchText(detailUrl(vehicle.sourceId)),
      vehicle.sourceId,
    );
    details.set(vehicle.sourceId, detail);
    await sleep(DELAY_BETWEEN_REQUESTS_MS);
  }
  return details;
}

const sourceIdOf = (technicalSpecs: Prisma.JsonValue): string | null => {
  const specs = technicalSpecs as { source?: { id?: unknown } } | null;
  return typeof specs?.source?.id === 'string' ? specs.source.id : null;
};

/** Na simulação, a API pública mostra só os disponíveis. É o que o cliente vê hoje. */
async function readExistingFromApi(): Promise<ExistingVehicle[]> {
  const body = JSON.parse(await fetchText(PUBLIC_VEHICLES_URL)) as {
    data: {
      id: string;
      title: string;
      price: string;
      mileage: number;
      status: string;
      technicalSpecs: Prisma.JsonValue;
      dealer: { name: string };
    }[];
    meta: { total: number; limit: number };
  };
  if (body.meta.total > body.meta.limit) {
    throw new Error(
      `A API tem ${body.meta.total} veículos e a leitura vai só até ${body.meta.limit}.`,
    );
  }
  return body.data
    .filter((vehicle) => vehicle.dealer.name === DEALER_NAME)
    .map((vehicle) => ({
      id: vehicle.id,
      title: vehicle.title,
      price: Number(vehicle.price),
      mileage: vehicle.mileage,
      status: vehicle.status,
      sourceId: sourceIdOf(vehicle.technicalSpecs),
    }));
}

export function buildVehicleData(
  vehicle: ListedVehicle,
  detail: VehicleDetail,
) {
  const name = parseVehicleName(vehicle.title);
  const technicalSpecs: Prisma.InputJsonObject = {
    fuel: vehicle.fuel,
    transmission: vehicle.transmission,
    engine: name.engine,
    source: {
      site: 'renatinhuscars.com.br',
      id: vehicle.sourceId,
      url: `https://www.renatinhuscars.com.br/?id=${vehicle.sourceId}`,
    },
  };
  return {
    title: vehicle.title,
    make: name.make,
    model: name.model,
    version: name.version,
    yearModel: name.year,
    yearFab: name.year,
    price: vehicle.price as number,
    mileage: vehicle.mileage,
    condition: detail.condition,
    technicalSpecs,
    features: detail.features,
    status: 'AVAILABLE' as const,
  };
}

export const mediaData = (detail: VehicleDetail) =>
  detail.photos.map((url, order) => ({ url, order }));

export function printPlan(
  plan: SyncPlan,
  details: Map<string, VehicleDetail>,
): void {
  const line = (vehicle: ListedVehicle) => {
    const detail = details.get(vehicle.sourceId);
    const body =
      detectBodyType(parseVehicleName(vehicle.title).model) ?? 'SEM CARROCERIA';
    return `${vehicle.title} | R$ ${vehicle.price} | ${vehicle.mileage} km | ${body} | ${detail?.photos.length ?? 0} fotos | ${detail?.features.length ?? 0} opcionais`;
  };
  const section = (title: string, rows: string[]) => {
    console.log(`\n${title}: ${rows.length}`);
    rows.forEach((row) => console.log(`  ${row}`));
  };

  section('Criar', plan.create.map(line));
  section(
    'Atualizar',
    plan.update.map(
      (item) => `${line(item.vehicle)} | ${item.changes.join('; ')}`,
    ),
  );
  section(
    'Sem mudança',
    plan.unchanged.map((item) => line(item.vehicle)),
  );
  section(
    'Marcar como vendido (saiu do site)',
    plan.markSold.map((vehicle) => `${vehicle.title} | R$ ${vehicle.price}`),
  );
  section(
    'Esconder (site sem preço)',
    plan.hide.map((vehicle) => `${vehicle.title} | R$ ${vehicle.price}`),
  );
  section(
    'Não importar (R$ Consulte)',
    plan.skippedNoPrice.map((vehicle) => vehicle.title),
  );
}

async function applyPlan(
  prisma: PrismaClient,
  dealerId: string,
  plan: SyncPlan,
  details: Map<string, VehicleDetail>,
): Promise<string[]> {
  const detailFor = (sourceId: string) => {
    const detail = details.get(sourceId);
    if (!detail) throw new Error(`Detalhe ausente do veículo ${sourceId}`);
    return detail;
  };

  const touched = await prisma.$transaction(async (tx) => {
    const ids: string[] = [];

    for (const vehicle of plan.create) {
      const detail = detailFor(vehicle.sourceId);
      const data = buildVehicleData(vehicle, detail);
      const bodyType = detectBodyType(data.model);
      if (!bodyType) {
        throw new Error(`Modelo sem carroceria conhecida: ${data.model}`);
      }
      const created = await tx.vehicle.create({
        data: {
          ...data,
          dealerId,
          bodyType,
          media: { create: mediaData(detail) },
        },
      });
      ids.push(created.id);
    }

    for (const { id, vehicle } of [...plan.update, ...plan.unchanged]) {
      const detail = detailFor(vehicle.sourceId);
      await tx.vehicle.update({
        where: { id },
        data: {
          ...buildVehicleData(vehicle, detail),
          media: { deleteMany: {}, create: mediaData(detail) },
        },
      });
      ids.push(id);
    }

    const sold = plan.markSold.map((vehicle) => vehicle.id);
    if (sold.length > 0) {
      await tx.vehicle.updateMany({
        where: { id: { in: sold }, dealerId },
        data: { status: 'SOLD' },
      });
    }
    const hidden = plan.hide.map((vehicle) => vehicle.id);
    if (hidden.length > 0) {
      await tx.vehicle.updateMany({
        where: { id: { in: hidden }, dealerId },
        data: { status: 'RESERVED' },
      });
    }

    return ids;
  });

  return touched;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  if (apply && !process.env.DATABASE_URL) {
    throw new Error('--apply exige DATABASE_URL.');
  }
  if (apply && !process.env.OPENAI_API_KEY) {
    throw new Error(
      '--apply exige OPENAI_API_KEY para atualizar a busca semântica.',
    );
  }

  const listed = parseListing(await fetchText(LISTING_URL));
  const priced = listed.filter((vehicle) => vehicle.price !== null);
  const details = await fetchDetails(priced);

  const unknownModels = priced
    .map((vehicle) => parseVehicleName(vehicle.title).model)
    .filter((model) => !detectBodyType(model));

  if (!apply) {
    const existing = await readExistingFromApi();
    assertPlausibleListing(listed.length, existing.length);
    printPlan(planSync(listed, existing), details);
    if (unknownModels.length > 0) {
      console.log(`\nModelos sem carroceria: ${unknownModels.join(', ')}`);
    }
    console.log(
      '\nCadastro público da loja: passa a ter o endereço em São Paulo, sem telefone.',
    );
    console.log('\nSimulação: nada foi gravado. Use --apply para gravar.');
    return;
  }

  const prisma = new PrismaClient();
  try {
    const dealer = await prisma.dealer.findFirstOrThrow({
      where: { name: DEALER_NAME },
    });
    const rows = await prisma.vehicle.findMany({
      where: { dealerId: dealer.id },
    });
    const existing: ExistingVehicle[] = rows.map((vehicle) => ({
      id: vehicle.id,
      title: vehicle.title,
      price: Number(vehicle.price),
      mileage: vehicle.mileage,
      status: vehicle.status,
      sourceId: sourceIdOf(vehicle.technicalSpecs),
    }));

    assertPlausibleListing(
      listed.length,
      existing.filter((vehicle) => vehicle.status === 'AVAILABLE').length,
    );
    const plan = planSync(listed, existing);
    printPlan(plan, details);

    const touched = await applyPlan(prisma, dealer.id, plan, details);
    // O contato do comprador é o canal do piloto: o telefone da loja não fica na API pública.
    await prisma.dealer.update({
      where: { id: dealer.id },
      data: {
        contactInfo: { address: 'Av. São Miguel, 9299 - São Paulo - SP' },
      },
    });
    console.log(`\nGravado: ${touched.length} veículos publicados.`);

    const embeddings = new EmbeddingService(prisma as unknown as PrismaService);
    const failed: string[] = [];
    for (const id of touched) {
      if (!(await embeddings.syncVehicleEmbedding(id))) failed.push(id);
    }
    if (failed.length > 0) {
      throw new Error(
        `Estoque gravado, mas a busca semântica falhou em ${failed.length} veículos. Rode de novo: ${failed.join(', ')}`,
      );
    }
    console.log('Busca semântica atualizada.');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
