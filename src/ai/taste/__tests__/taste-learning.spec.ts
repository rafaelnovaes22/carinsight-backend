import {
  TasteProfile,
  TasteVehicleAttributes,
  createEmptyTaste,
  recordTasteExposures,
} from '../taste-profile';
import {
  TasteVehicleLookup,
  learnTasteFromSession,
  numberArrayOf,
  stringRecordOf,
} from '../taste-learning';

const CATALOG: Record<string, TasteVehicleAttributes> = {
  'v-suv': {
    vehicleId: 'v-suv',
    embedding: [1, 0],
    bodyType: 'SUV',
    brand: 'Toyota',
    fuelType: 'Flex',
    transmission: 'Automatico',
    price: 90000,
  },
  'v-sedan': {
    vehicleId: 'v-sedan',
    embedding: [0, 1],
    bodyType: 'Sedan',
    brand: 'Honda',
    fuelType: 'Flex',
    transmission: 'Automatico',
    price: 80000,
  },
};

const lookup: TasteVehicleLookup = async (ids) =>
  ids.map((id) => CATALOG[id]).filter((v) => v !== undefined);

describe('learnTasteFromSession', () => {
  it('returns the same object when no new flags arrived', async () => {
    const taste = createEmptyTaste();
    await expect(learnTasteFromSession(taste, [], lookup)).resolves.toBe(taste);
  });

  it('learns views and advances the flag cursor', async () => {
    const taste = createEmptyTaste();
    const next = await learnTasteFromSession(
      taste,
      ['viewed_vehicle_v-suv'],
      lookup,
    );
    expect(next.engagements).toBeGreaterThan(0);
    expect(next.consumedFlags).toBe(1);
    expect(next.lastViewedVehicleId).toBe('v-suv');

    // Replay is a no-op: the cursor makes each flag count exactly once.
    await expect(
      learnTasteFromSession(next, ['viewed_vehicle_v-suv'], lookup),
    ).resolves.toBe(next);
  });

  it('ignores unknown vehicle ids but still advances the cursor', async () => {
    const taste = createEmptyTaste();
    const next = await learnTasteFromSession(
      taste,
      ['viewed_vehicle_missing'],
      lookup,
    );
    expect(next.engagements).toBe(0);
    expect(next.consumedFlags).toBe(1);
  });

  it('survives lookup failure without losing the cursor', async () => {
    const taste = createEmptyTaste();
    const failing: TasteVehicleLookup = async () => {
      throw new Error('db down');
    };
    const next = await learnTasteFromSession(
      taste,
      ['viewed_vehicle_v-suv'],
      failing,
    );
    expect(next.engagements).toBe(0);
    expect(next.consumedFlags).toBe(1);
  });

  it('attributes strong intent to the most recently viewed vehicle', async () => {
    let taste: TasteProfile = createEmptyTaste();
    taste = await learnTasteFromSession(
      taste,
      ['viewed_vehicle_v-suv', 'visit_requested'],
      lookup,
    );
    expect(taste.affinities['bodyType']?.['suv']).toBeGreaterThan(
      taste.affinities['bodyType']?.['sedan'] ?? 0,
    );
  });

  it('learns nothing from intent with no viewed vehicle', async () => {
    const taste = createEmptyTaste();
    const next = await learnTasteFromSession(
      taste,
      ['purchase_intent'],
      lookup,
    );
    expect(next.engagements).toBe(0);
  });

  it('penalizes shown-but-ignored vehicles on the next round', async () => {
    let taste: TasteProfile = createEmptyTaste();
    taste = await learnTasteFromSession(
      taste,
      ['viewed_vehicle_v-suv'],
      lookup,
    );
    taste = recordTasteExposures(taste, [
      { vehicleId: 'v-suv', score: 0.9 },
      { vehicleId: 'v-sedan', score: 0.8 },
    ]);
    const before = taste.affinities['bodyType']?.['sedan'] ?? 0;
    // Same history plus one neutral flag: forces a fresh learning round
    // where v-sedan (shown, never engaged) earns its skip penalty.
    taste = await learnTasteFromSession(
      taste,
      ['viewed_vehicle_v-suv', 'no_results'],
      lookup,
    );
    expect(taste.seen['v-sedan']?.skipPenalty ?? 0).toBeGreaterThan(0);
    expect(taste.affinities['bodyType']?.['sedan'] ?? 0).toBeLessThanOrEqual(
      before,
    );
  });
});

describe('json adapters', () => {
  it('stringRecordOf keeps only string entries', () => {
    expect(stringRecordOf({ fuel: 'Flex', power: 150 })).toEqual({
      fuel: 'Flex',
    });
    expect(stringRecordOf(null)).toEqual({});
    expect(stringRecordOf('nope')).toEqual({});
  });

  it('numberArrayOf keeps only numeric embeddings', () => {
    expect(numberArrayOf([1, 'x', 2])).toEqual([1, 2]);
    expect(numberArrayOf([])).toBeNull();
    expect(numberArrayOf('nope')).toBeNull();
  });
});
