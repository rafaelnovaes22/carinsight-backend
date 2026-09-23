/**
 * Derives taste events from LangGraph session flags.
 *
 * PORQUÊ flags e não nós: flags are the append-only, persisted record of
 * what already happened (viewed_vehicle_X, visit_requested...), so learning
 * reads them instead of threading new plumbing through every node. The
 * consumedFlags cursor makes each flag count exactly once, even across
 * repeated search rounds in the same session.
 *
 * PORQUÊ atribuição conservadora: strong intents (visit, purchase, handoff)
 * attach to the most recently viewed vehicle only; with no viewed vehicle
 * the intent is unattributed and teaches nothing. A false positive (wrong
 * car learned as loved) is worse than a missed signal.
 */

import {
  TASTE_CONFIG,
  TasteProfile,
  TasteVehicleAttributes,
  recordTasteEvent,
} from './taste-profile';

export type TasteVehicleLookup = (
  vehicleIds: string[],
) => Promise<TasteVehicleAttributes[]>;

const VIEWED_FLAG_PREFIX = 'viewed_vehicle_';
const STRONG_INTENT_FLAGS = [
  'visit_requested',
  'purchase_intent',
  'handoff_requested',
];
const SOFT_INTENT_FLAGS = ['financing_simulated', 'trade_in_evaluated'];

function viewedVehicleId(flag: string): string | null {
  if (!flag.startsWith(VIEWED_FLAG_PREFIX)) return null;
  const id = flag.slice(VIEWED_FLAG_PREFIX.length);
  return id ? id : null;
}

function skipCandidateIds(taste: TasteProfile): string[] {
  return Object.entries(taste.seen)
    .filter(
      ([, entry]) =>
        !entry.engaged &&
        entry.shows > 0 &&
        entry.skipPenalty < TASTE_CONFIG.maxSkipPenaltyPerVehicle,
    )
    .map(([vehicleId]) => vehicleId);
}

async function safeLookup(
  lookup: TasteVehicleLookup,
  vehicleIds: string[],
): Promise<TasteVehicleAttributes[]> {
  if (vehicleIds.length === 0) return [];
  try {
    return (await lookup(vehicleIds)) ?? [];
  } catch {
    // Learning must never break search: on lookup failure the session
    // simply keeps its previous taste. PORQUÊ: ranking degrades to the
    // current production behavior instead of erroring the conversation.
    return [];
  }
}

function attributeIntent(
  taste: TasteProfile,
  freshFlags: string[],
  catalog: Map<string, TasteVehicleAttributes>,
): TasteProfile {
  const strong = freshFlags.some((flag) => STRONG_INTENT_FLAGS.includes(flag));
  const soft =
    !strong && freshFlags.some((flag) => SOFT_INTENT_FLAGS.includes(flag));
  if (!strong && !soft) return taste;
  const targetId = taste.lastViewedVehicleId;
  if (!targetId) return taste;
  // No attributes (lookup miss): learn nothing rather than record a
  // zero-priced ghost engagement that would drag the price band down.
  const attrs = catalog.get(targetId);
  if (!attrs) return taste;
  return recordTasteEvent(
    taste,
    strong ? 'strong-intent' : 'soft-intent',
    attrs,
  );
}

/**
 * Lenient adapters for Prisma Json columns (technicalSpecs, embedding).
 * PORQUÊ lenientes: production rows predate any schema contract for these
 * shapes, so unknown content degrades to empty instead of throwing.
 */
export function stringRecordOf(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null) return {};
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') out[key] = entry;
  }
  return out;
}

export function numberArrayOf(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const numbers = value.filter(
    (entry): entry is number => typeof entry === 'number',
  );
  return numbers.length > 0 ? numbers : null;
}

/**
 * Advances session taste from flags added since the last call.
 * Idempotent per flag: replays nothing twice thanks to consumedFlags.
 */
export async function learnTasteFromSession(
  taste: TasteProfile,
  flags: string[],
  lookup: TasteVehicleLookup,
): Promise<TasteProfile> {
  const freshFlags = flags.slice(taste.consumedFlags);
  if (freshFlags.length === 0) return taste;

  const viewedIds = [
    ...new Set(
      freshFlags.map(viewedVehicleId).filter((id): id is string => id !== null),
    ),
  ];
  const skipIds = skipCandidateIds(taste).filter(
    (id) => !viewedIds.includes(id),
  );
  const intentTarget =
    taste.lastViewedVehicleId ?? viewedIds[viewedIds.length - 1] ?? null;
  const lookupIds = [...new Set([...viewedIds, ...skipIds])];
  if (intentTarget && !lookupIds.includes(intentTarget)) {
    lookupIds.push(intentTarget);
  }

  const catalog = new Map(
    (await safeLookup(lookup, lookupIds)).map((attrs) => [
      attrs.vehicleId,
      attrs,
    ]),
  );

  let next = taste;
  for (const vehicleId of skipIds) {
    const attrs = catalog.get(vehicleId);
    if (attrs) next = recordTasteEvent(next, 'skip', attrs);
  }
  for (const vehicleId of viewedIds) {
    const attrs = catalog.get(vehicleId);
    if (attrs) next = recordTasteEvent(next, 'view', attrs);
  }
  next = attributeIntent(next, freshFlags, catalog);
  return { ...next, consumedFlags: flags.length };
}
