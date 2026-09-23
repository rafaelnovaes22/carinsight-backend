/**
 * Session-scoped taste model for vehicle recommendation.
 *
 * PORQUÊ este módulo existe: the explicit CustomerProfile (budget,
 * bodyType, usage...) captures stated needs, but revealed preference only
 * appears in behavior: which cars the customer opens, simulates financing
 * for, or ignores after seeing them. Taste learns that signal inside the
 * conversation session, so it persists through ChatSession.state JSON with
 * zero DB migration (slice 1). Cross-session hydration from UserInteraction
 * is a later slice, deliberately out of scope here.
 *
 * PORQUÊ puro e sem dependências: every function here is deterministic and
 * Nest-free, so the whole model is unit-testable with `npx jest src/ai/taste`
 * and can never break the search path with DI or I/O failures.
 */

export const TASTE_VERSION = 1;

export const TASTE_CONFIG = {
  maxBonus: 0.35,
  bonusPerEngagement: 0.05,
  viewWeight: 1.5,
  strongIntentWeight: 2.5,
  softIntentWeight: 1.0,
  skipPenalty: 0.4,
  maxSkipPenaltyPerVehicle: 1.0,
  maxExposures: 30,
  centroidPart: 0.5,
  affinityPart: 0.3,
  pricePart: 0.2,
} as const;

export interface TasteVehicleAttributes {
  vehicleId: string;
  embedding: number[] | null;
  bodyType: string;
  brand: string;
  fuelType: string;
  transmission: string;
  price: number;
}

export type TasteEventKind = 'view' | 'strong-intent' | 'soft-intent' | 'skip';

export interface TasteSeenEntry {
  shows: number;
  engaged: boolean;
  skipPenalty: number;
}

export interface TasteExposure {
  vehicleId: string;
  position: number;
  score: number;
  at: number;
}

export interface TasteProfile {
  version: number;
  centroid: number[] | null;
  centroidWeight: number;
  engagements: number;
  affinities: Record<string, Record<string, number>>;
  priceSum: number;
  priceCount: number;
  seen: Record<string, TasteSeenEntry>;
  exposures: TasteExposure[];
  consumedFlags: number;
  lastViewedVehicleId: string | null;
}

export interface TasteScoreBreakdown {
  score: number;
  strength: number;
  centroid: number;
  affinity: number;
  priceFit: number;
}

export interface TasteRankItem {
  vehicleId: string;
  baseScore: number;
}

export interface TasteRankedItem extends TasteRankItem {
  finalScore: number;
  taste: TasteScoreBreakdown;
}

const AFFINITY_KEYS = [
  'bodyType',
  'brand',
  'fuelType',
  'transmission',
] as const;

export function createEmptyTaste(): TasteProfile {
  return {
    version: TASTE_VERSION,
    centroid: null,
    centroidWeight: 0,
    engagements: 0,
    affinities: {},
    priceSum: 0,
    priceCount: 0,
    seen: {},
    exposures: [],
    consumedFlags: 0,
    lastViewedVehicleId: null,
  };
}

export function neutralTasteAttributes(
  vehicleId: string,
): TasteVehicleAttributes {
  return {
    vehicleId,
    embedding: null,
    bodyType: '',
    brand: '',
    fuelType: '',
    transmission: '',
    price: 0,
  };
}

/**
 * Local cosine: mirrors EmbeddingService.cosineSimilarity on purpose.
 * PORQUÊ duplicado em vez de importado: importing the Nest injectable
 * would couple this pure module to the DI container; the 8-line formula
 * is stable and covered by tests here.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function normalizeAttribute(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function eventWeight(kind: TasteEventKind): number {
  if (kind === 'strong-intent') return TASTE_CONFIG.strongIntentWeight;
  if (kind === 'soft-intent') return TASTE_CONFIG.softIntentWeight;
  if (kind === 'skip') return 0;
  return TASTE_CONFIG.viewWeight;
}

function bumpAffinities(
  affinities: TasteProfile['affinities'],
  attrs: TasteVehicleAttributes,
  weight: number,
): TasteProfile['affinities'] {
  const next: TasteProfile['affinities'] = { ...affinities };
  for (const key of AFFINITY_KEYS) {
    const value = normalizeAttribute(attrs[key]);
    if (!value) continue;
    const bucket = next[key] ?? {};
    bucket[value] = (bucket[value] ?? 0) + weight;
    next[key] = bucket;
  }
  return next;
}

function blendCentroid(
  centroid: number[] | null,
  centroidWeight: number,
  embedding: number[] | null,
  weight: number,
): { centroid: number[] | null; centroidWeight: number } {
  if (!embedding || embedding.length === 0) return { centroid, centroidWeight };
  if (!centroid) return { centroid: [...embedding], centroidWeight: weight };
  // Dim drift (model swap mid-session): ignore the outlier, never corrupt
  // learned state. PORQUÊ: one bad vector must not erase a whole session.
  if (centroid.length !== embedding.length) return { centroid, centroidWeight };
  const total = centroidWeight + weight;
  const next = centroid.map(
    (c, i) => (c * centroidWeight + embedding[i] * weight) / total,
  );
  return { centroid: next, centroidWeight: total };
}

function emptySeenEntry(): TasteSeenEntry {
  return { shows: 0, engaged: false, skipPenalty: 0 };
}

function applyEngagement(
  taste: TasteProfile,
  kind: TasteEventKind,
  attrs: TasteVehicleAttributes,
): TasteProfile {
  const weight = eventWeight(kind);
  const blended = blendCentroid(
    taste.centroid,
    taste.centroidWeight,
    attrs.embedding,
    weight,
  );
  const seen = taste.seen[attrs.vehicleId] ?? emptySeenEntry();
  return {
    ...taste,
    centroid: blended.centroid,
    centroidWeight: blended.centroidWeight,
    engagements: taste.engagements + weight,
    affinities: bumpAffinities(taste.affinities, attrs, weight),
    priceSum: taste.priceSum + attrs.price * weight,
    priceCount: taste.priceCount + weight,
    seen: {
      ...taste.seen,
      [attrs.vehicleId]: { ...seen, engaged: true },
    },
    lastViewedVehicleId: attrs.vehicleId,
  };
}

function applySkip(
  taste: TasteProfile,
  attrs: TasteVehicleAttributes,
): TasteProfile {
  const seen = taste.seen[attrs.vehicleId] ?? emptySeenEntry();
  const room = TASTE_CONFIG.maxSkipPenaltyPerVehicle - seen.skipPenalty;
  if (room <= 0) return taste;
  const penalty = Math.min(room, TASTE_CONFIG.skipPenalty);
  const affinities: TasteProfile['affinities'] = { ...taste.affinities };
  for (const key of AFFINITY_KEYS) {
    const value = normalizeAttribute(attrs[key]);
    const bucket = affinities[key];
    const current = value ? (bucket?.[value] ?? 0) : 0;
    if (current <= 0) continue;
    affinities[key] = { ...bucket, [value]: Math.max(0, current - penalty) };
  }
  return {
    ...taste,
    affinities,
    seen: {
      ...taste.seen,
      [attrs.vehicleId]: { ...seen, skipPenalty: seen.skipPenalty + penalty },
    },
  };
}

export function recordTasteEvent(
  taste: TasteProfile,
  kind: TasteEventKind,
  attrs: TasteVehicleAttributes,
): TasteProfile {
  if (kind === 'skip') return applySkip(taste, attrs);
  return applyEngagement(taste, kind, attrs);
}

/**
 * Bonus strength actually applied. Zero while cold, which makes
 * blendTasteRanking a provable no-op before any engagement (gate tested).
 */
export function tasteStrength(taste: TasteProfile): number {
  if (taste.engagements <= 0) return 0;
  return Math.min(
    TASTE_CONFIG.maxBonus,
    TASTE_CONFIG.bonusPerEngagement * taste.engagements,
  );
}

function centroidScore(
  embedding: number[] | null,
  taste: TasteProfile,
): number {
  if (!embedding || !taste.centroid) return 0;
  return Math.max(0, cosineSimilarity(embedding, taste.centroid));
}

function affinityScore(
  attrs: TasteVehicleAttributes,
  taste: TasteProfile,
): number {
  if (taste.engagements <= 0) return 0;
  let matched = 0;
  for (const key of AFFINITY_KEYS) {
    const value = normalizeAttribute(attrs[key]);
    if (value) matched += taste.affinities[key]?.[value] ?? 0;
  }
  return Math.max(0, Math.min(1, matched / taste.engagements));
}

function priceFitScore(price: number, taste: TasteProfile): number {
  if (taste.priceCount <= 0 || price <= 0) return 0;
  const mean = taste.priceSum / taste.priceCount;
  if (mean <= 0) return 0;
  return Math.max(0, 1 - Math.abs(price - mean) / (mean * 0.5));
}

export function scoreTasteCandidate(
  attrs: TasteVehicleAttributes,
  taste: TasteProfile,
): TasteScoreBreakdown {
  const strength = tasteStrength(taste);
  if (strength <= 0) {
    return { score: 0, strength: 0, centroid: 0, affinity: 0, priceFit: 0 };
  }
  const centroid = centroidScore(attrs.embedding, taste);
  const affinity = affinityScore(attrs, taste);
  const priceFit = priceFitScore(attrs.price, taste);
  const score =
    TASTE_CONFIG.centroidPart * centroid +
    TASTE_CONFIG.affinityPart * affinity +
    TASTE_CONFIG.pricePart * priceFit;
  return { score, strength, centroid, affinity, priceFit };
}

export function blendTasteRanking(
  items: TasteRankItem[],
  taste: TasteProfile,
  resolveAttrs: (vehicleId: string) => TasteVehicleAttributes,
): TasteRankedItem[] {
  const scored = items.map((item, index) => {
    const breakdown = scoreTasteCandidate(resolveAttrs(item.vehicleId), taste);
    return {
      ...item,
      finalScore: item.baseScore + breakdown.strength * breakdown.score,
      taste: breakdown,
      index,
    };
  });
  scored.sort((a, b) => b.finalScore - a.finalScore || a.index - b.index);
  return scored.map(({ index: _index, ...rest }) => rest);
}

export function recordTasteExposures(
  taste: TasteProfile,
  shown: Array<{ vehicleId: string; score: number }>,
): TasteProfile {
  const exposures = [...taste.exposures];
  const seen = { ...taste.seen };
  shown.forEach((item, position) => {
    exposures.push({
      vehicleId: item.vehicleId,
      position,
      score: item.score,
      at: Date.now(),
    });
    const entry = seen[item.vehicleId] ?? emptySeenEntry();
    seen[item.vehicleId] = { ...entry, shows: entry.shows + 1 };
  });
  return {
    ...taste,
    exposures: exposures.slice(-TASTE_CONFIG.maxExposures),
    seen,
  };
}
