/**
 * Leitura do estoque público da Renatinhu's Cars (plataforma Armazém) e cálculo
 * do que precisa mudar no banco. Sem I/O: quem busca e grava é prisma/sync-renatinhus.ts.
 */

export interface ListedVehicle {
  sourceId: string;
  title: string;
  /** null quando o site mostra "R$ Consulte". */
  price: number | null;
  mileage: number;
  fuel: string | null;
  transmission: string | null;
}

export interface VehicleDetail {
  features: string[];
  photos: string[];
  condition: 'NEW' | 'USED';
}

export interface ParsedName {
  make: string;
  model: string;
  version: string | null;
  year: number;
  engine: string | null;
}

export interface ExistingVehicle {
  id: string;
  title: string;
  price: number;
  mileage: number;
  status: string;
  sourceId: string | null;
}

export interface SyncPlan {
  create: ListedVehicle[];
  update: { id: string; vehicle: ListedVehicle; changes: string[] }[];
  unchanged: { id: string; vehicle: ListedVehicle }[];
  /** Saíram do site: provavelmente vendidos. */
  markSold: ExistingVehicle[];
  /** Seguem no site, mas sem preço: não dá para exibir. */
  hide: ExistingVehicle[];
  skippedNoPrice: ListedVehicle[];
}

const COMPOUND_MAKES = ['LAND ROVER', 'CAOA CHERY', 'ALFA ROMEO'];
const COMPOUND_MODELS = [
  'COROLLA CROSS',
  'GRAND LIVINA',
  'GRAND SIENA',
  'ONIX PLUS',
  'SANTA FE',
];

const BODY_TYPE_BY_MODEL: Record<string, string> = {
  // SUV
  AIRCROSS: 'suv',
  CAPTUR: 'suv',
  COMPASS: 'suv',
  'COROLLA CROSS': 'suv',
  CRETA: 'suv',
  DUSTER: 'suv',
  ECOSPORT: 'suv',
  GLA: 'suv',
  'HR-V': 'suv',
  KICKS: 'suv',
  NIVUS: 'suv',
  RENEGADE: 'suv',
  SPORTAGE: 'suv',
  'T-CROSS': 'suv',
  TRACKER: 'suv',
  TUCSON: 'suv',
  // Sedan
  '320I': 'sedan',
  CITY: 'sedan',
  CIVIC: 'sedan',
  COBALT: 'sedan',
  COROLLA: 'sedan',
  CRONOS: 'sedan',
  CRUZE: 'sedan',
  HB20S: 'sedan',
  JETTA: 'sedan',
  LOGAN: 'sedan',
  'ONIX PLUS': 'sedan',
  PRISMA: 'sedan',
  SANTANA: 'sedan',
  SENTRA: 'sedan',
  VERSA: 'sedan',
  VIRTUS: 'sedan',
  // Hatch
  '207': 'hatch',
  ARGO: 'hatch',
  C3: 'hatch',
  FIESTA: 'hatch',
  FIT: 'hatch',
  FOX: 'hatch',
  FUSCA: 'hatch',
  GOL: 'hatch',
  HB20: 'hatch',
  I30: 'hatch',
  KA: 'hatch',
  KWID: 'hatch',
  MOBI: 'hatch',
  ONIX: 'hatch',
  POLO: 'hatch',
  SANDERO: 'hatch',
  UNO: 'hatch',
  // Outros
  DOBLO: 'minivan',
  'GRAND LIVINA': 'minivan',
  SPIN: 'minivan',
  MONTANA: 'pickup',
  SAVEIRO: 'pickup',
  STRADA: 'pickup',
  TORO: 'pickup',
  VARIANT: 'perua',
};

const decodeEntities = (text: string): string =>
  text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

export function parseListing(html: string): ListedVehicle[] {
  return html
    .split("<div class='listing-list-loop'>")
    .slice(1)
    .map((block) => {
      const sourceId = block.match(/Det\((\d+)/)?.[1];
      const title = block.match(
        /title heading-font'><a[^>]*>([^<]+)<\/a>/,
      )?.[1];
      if (!sourceId || !title) {
        throw new Error(
          `Bloco do estoque fora do formato esperado: ${block.slice(0, 200)}`,
        );
      }
      const price = block.match(/heading-font'>R\$ ([\d.]+)/)?.[1];
      const mileage = block.match(
        /quilometragem[\s\S]*?value h5'>([\d.]+)/,
      )?.[1];
      return {
        sourceId,
        title: decodeEntities(title).trim(),
        price: price ? Number(price.replace(/\./g, '')) : null,
        mileage: mileage ? Number(mileage.replace(/\./g, '')) : 0,
        fuel:
          block.match(/ fuel'>[\s\S]*?value h5'>([^<]+)/)?.[1]?.trim() ?? null,
        transmission:
          block
            .match(/ transmission'>[\s\S]*?value h5'>([^<]+)/)?.[1]
            ?.trim() ?? null,
      };
    });
}

export function parseDetail(html: string, sourceId: string): VehicleDetail {
  const photoPattern = new RegExp(
    `https://[^'"\\s]+/fotos/\\d+_${sourceId}_(\\d+)-1\\.jpg`,
    'g',
  );
  const photos = new Map<number, string>();
  for (const match of html.matchAll(photoPattern)) {
    photos.set(Number(match[1]), match[0]);
  }

  const optionsStart = html.indexOf('id="tab-opcional"');
  const optionsEnd = html.indexOf('id="tab-detalhe"', optionsStart);
  const options =
    optionsStart >= 0 && optionsEnd > optionsStart
      ? html.slice(optionsStart, optionsEnd)
      : '';
  const features = [...options.matchAll(/<\/i>([^<]+)<\/li>/g)].map((match) =>
    decodeEntities(match[1]).trim(),
  );

  const condition = html.match(/id="txtNovoUsado"\s+value="([^"]*)"/)?.[1];

  return {
    features: [...new Set(features)],
    photos: [...photos.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, url]) => url),
    condition: condition?.trim().toLowerCase() === 'novo' ? 'NEW' : 'USED',
  };
}

export function parseVehicleName(title: string): ParsedName {
  const tokens = title.trim().split(/\s+/);
  const year = Number(tokens.at(-1));
  if (!Number.isInteger(year) || year < 1900) {
    throw new Error(`Título sem ano no final: "${title}"`);
  }
  const words = tokens.slice(0, -1);

  const firstTwo = words.slice(0, 2).join(' ').toUpperCase();
  const makeLength = COMPOUND_MAKES.includes(firstTwo) ? 2 : 1;
  const make = words.slice(0, makeLength).join(' ').toUpperCase();

  const afterMake = words.slice(makeLength);
  const candidate = afterMake.slice(0, 2).join(' ').toUpperCase();
  const modelLength = COMPOUND_MODELS.includes(candidate) ? 2 : 1;
  const model = afterMake.slice(0, modelLength).join(' ').toUpperCase();
  const version = afterMake.slice(modelLength).join(' ') || null;

  return {
    make,
    model,
    version,
    year,
    engine: version?.match(/\b\d\.\d\b/)?.[0] ?? null,
  };
}

/** null quando o modelo não é conhecido: preferimos avisar a chutar a carroceria. */
export function detectBodyType(model: string): string | null {
  return BODY_TYPE_BY_MODEL[model.toUpperCase()] ?? null;
}

const normalizeTitle = (title: string): string =>
  title.trim().replace(/\s+/g, ' ').toUpperCase();

export function planSync(
  listed: ListedVehicle[],
  existing: ExistingVehicle[],
): SyncPlan {
  const plan: SyncPlan = {
    create: [],
    update: [],
    unchanged: [],
    markSold: [],
    hide: [],
    skippedNoPrice: [],
  };
  const remaining = new Map(existing.map((vehicle) => [vehicle.id, vehicle]));

  const takeMatch = (vehicle: ListedVehicle): ExistingVehicle | undefined => {
    const candidates = [...remaining.values()];
    const match =
      candidates.find((item) => item.sourceId === vehicle.sourceId) ??
      candidates.find(
        (item) =>
          item.sourceId === null &&
          normalizeTitle(item.title) === normalizeTitle(vehicle.title),
      );
    if (match) remaining.delete(match.id);
    return match;
  };

  for (const vehicle of listed) {
    const match = takeMatch(vehicle);

    if (vehicle.price === null) {
      plan.skippedNoPrice.push(vehicle);
      if (match && match.status === 'AVAILABLE') plan.hide.push(match);
      continue;
    }
    if (!match) {
      plan.create.push(vehicle);
      continue;
    }

    const changes: string[] = [];
    if (match.price !== vehicle.price) {
      changes.push(`preço ${match.price} -> ${vehicle.price}`);
    }
    if (match.mileage !== vehicle.mileage) {
      changes.push(`km ${match.mileage} -> ${vehicle.mileage}`);
    }
    if (match.status !== 'AVAILABLE') {
      changes.push(`status ${match.status} -> AVAILABLE`);
    }
    if (match.sourceId === null) changes.push('vincula ao código do site');

    if (changes.length > 0) {
      plan.update.push({ id: match.id, vehicle, changes });
    } else {
      plan.unchanged.push({ id: match.id, vehicle });
    }
  }

  plan.markSold = [...remaining.values()].filter(
    (vehicle) => vehicle.status === 'AVAILABLE',
  );
  return plan;
}

/**
 * Trava contra leitura quebrada: se o site mudar de layout ou responder pela metade,
 * a sincronização marcaria o estoque inteiro como vendido.
 */
export function assertPlausibleListing(
  listedCount: number,
  availableCount: number,
): void {
  const minimum = Math.max(5, Math.ceil(availableCount * 0.5));
  if (listedCount < minimum) {
    throw new Error(
      `Só ${listedCount} veículos lidos do site, para ${availableCount} disponíveis no banco (mínimo ${minimum}). Nada foi alterado.`,
    );
  }
}
