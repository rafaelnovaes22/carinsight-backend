import {
  TASTE_CONFIG,
  TasteProfile,
  TasteVehicleAttributes,
  blendTasteRanking,
  cosineSimilarity,
  createEmptyTaste,
  neutralTasteAttributes,
  recordTasteEvent,
  recordTasteExposures,
  scoreTasteCandidate,
  tasteStrength,
} from '../taste-profile';

function vehicle(
  overrides: Partial<TasteVehicleAttributes> = {},
): TasteVehicleAttributes {
  return {
    vehicleId: 'v1',
    embedding: [1, 0, 0],
    bodyType: 'SUV',
    brand: 'Toyota',
    fuelType: 'Flex',
    transmission: 'Automatico',
    price: 90000,
    ...overrides,
  };
}

describe('createEmptyTaste', () => {
  it('starts cold with no signal', () => {
    const taste = createEmptyTaste();
    expect(taste.centroid).toBeNull();
    expect(taste.engagements).toBe(0);
    expect(tasteStrength(taste)).toBe(0);
  });
});

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });

  it('returns 0 for mismatched or empty vectors', () => {
    expect(cosineSimilarity([1], [1, 2])).toBe(0);
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe('recordTasteEvent', () => {
  it('builds a centroid as a running weighted average', () => {
    let taste = createEmptyTaste();
    taste = recordTasteEvent(taste, 'view', vehicle({ embedding: [1, 0] }));
    expect(taste.centroid).toEqual([1, 0]);
    expect(taste.engagements).toBeCloseTo(TASTE_CONFIG.viewWeight);

    taste = recordTasteEvent(
      taste,
      'strong-intent',
      vehicle({ vehicleId: 'v2', embedding: [0, 1] }),
    );
    const w1 = TASTE_CONFIG.viewWeight;
    const w2 = TASTE_CONFIG.strongIntentWeight;
    expect(taste.centroid?.[0]).toBeCloseTo(w1 / (w1 + w2));
    expect(taste.centroid?.[1]).toBeCloseTo(w2 / (w1 + w2));
    expect(taste.lastViewedVehicleId).toBe('v2');
  });

  it('ignores embeddings with drifted dimensions instead of corrupting state', () => {
    let taste = createEmptyTaste();
    taste = recordTasteEvent(taste, 'view', vehicle({ embedding: [1, 0] }));
    const kept = taste.centroid;
    taste = recordTasteEvent(taste, 'view', vehicle({ embedding: [1, 0, 0] }));
    expect(taste.centroid).toEqual(kept);
  });

  it('accumulates attribute affinities and tracks the price band', () => {
    let taste = createEmptyTaste();
    taste = recordTasteEvent(taste, 'view', vehicle({ price: 80000 }));
    taste = recordTasteEvent(
      taste,
      'view',
      vehicle({ vehicleId: 'v2', price: 100000 }),
    );
    expect(taste.affinities['bodyType']?.['suv']).toBeCloseTo(
      TASTE_CONFIG.viewWeight * 2,
    );
    expect(taste.priceSum / taste.priceCount).toBeCloseTo(90000);
  });

  it('floors affinities at zero and caps skip penalty per vehicle', () => {
    let taste: TasteProfile = createEmptyTaste();
    taste = recordTasteEvent(taste, 'view', vehicle());
    for (let i = 0; i < 10; i++) {
      taste = recordTasteEvent(taste, 'skip', vehicle());
    }
    expect(taste.affinities['bodyType']?.['suv']).toBeCloseTo(
      TASTE_CONFIG.viewWeight - TASTE_CONFIG.maxSkipPenaltyPerVehicle,
    );
    expect(taste.seen['v1']?.skipPenalty).toBeLessThanOrEqual(
      TASTE_CONFIG.maxSkipPenaltyPerVehicle,
    );
    // Skips never move the centroid: only love steers taste, never hate.
    expect(taste.centroid).toEqual([1, 0, 0]);
  });
});

describe('scoreTasteCandidate', () => {
  it('scores zero while cold', () => {
    const breakdown = scoreTasteCandidate(vehicle(), createEmptyTaste());
    expect(breakdown).toEqual({
      score: 0,
      strength: 0,
      centroid: 0,
      affinity: 0,
      priceFit: 0,
    });
  });

  it('combines centroid, affinity and price parts', () => {
    let taste = createEmptyTaste();
    taste = recordTasteEvent(taste, 'view', vehicle({ price: 90000 }));
    const breakdown = scoreTasteCandidate(vehicle(), taste);
    expect(breakdown.centroid).toBeCloseTo(1);
    expect(breakdown.affinity).toBeGreaterThan(0);
    expect(breakdown.priceFit).toBeCloseTo(1);
    expect(breakdown.score).toBeCloseTo(
      TASTE_CONFIG.centroidPart * breakdown.centroid +
        TASTE_CONFIG.affinityPart * breakdown.affinity +
        TASTE_CONFIG.pricePart * breakdown.priceFit,
    );
  });

  it('caps strength so taste never overrides hard filters', () => {
    let taste = createEmptyTaste();
    for (let i = 0; i < 100; i++) {
      taste = recordTasteEvent(taste, 'view', vehicle({ vehicleId: `v${i}` }));
    }
    expect(tasteStrength(taste)).toBe(TASTE_CONFIG.maxBonus);
  });
});

describe('blendTasteRanking', () => {
  const items = [
    { vehicleId: 'a', baseScore: 0.9 },
    { vehicleId: 'b', baseScore: 0.8 },
  ];

  it('is a provable no-op while cold: same order, same scores', () => {
    const resolve = (id: string) => neutralTasteAttributes(id);
    const ranked = blendTasteRanking(items, createEmptyTaste(), resolve);
    expect(ranked.map((r) => r.vehicleId)).toEqual(['a', 'b']);
    expect(ranked.map((r) => r.finalScore)).toEqual([0.9, 0.8]);
  });

  it('promotes vehicles near learned taste', () => {
    let taste = createEmptyTaste();
    for (let i = 0; i < 3; i++) {
      taste = recordTasteEvent(
        taste,
        'view',
        vehicle({ vehicleId: `seen-${i}`, embedding: [0, 1], price: 90000 }),
      );
    }
    const items = [
      { vehicleId: 'a', baseScore: 0.85 },
      { vehicleId: 'b', baseScore: 0.8 },
    ];
    const resolve = (id: string) =>
      id === 'b'
        ? vehicle({ vehicleId: id, embedding: [0, 1], price: 90000 })
        : vehicle({
            vehicleId: id,
            embedding: [1, 0],
            bodyType: 'Sedan',
            brand: 'Honda',
            price: 120000,
          });
    const ranked = blendTasteRanking(items, taste, resolve);
    expect(ranked[0]?.vehicleId).toBe('b');
    expect(ranked[0]?.finalScore).toBeGreaterThan(ranked[0]?.baseScore ?? 0);
  });
});

describe('recordTasteExposures', () => {
  it('counts shows and caps the ring buffer', () => {
    let taste = createEmptyTaste();
    const shown = Array.from({ length: 40 }, (_, i) => ({
      vehicleId: `v${i}`,
      score: 0.9,
    }));
    taste = recordTasteExposures(taste, shown);
    expect(taste.exposures).toHaveLength(TASTE_CONFIG.maxExposures);
    expect(taste.seen['v0']?.shows).toBe(1);
  });
});
