import { ParallelumCatalog } from './parallelum-catalog';
import { CatalogSettings } from './catalog-settings';

const settings: CatalogSettings = {
  baseUrl: 'https://catalog.example.test/v2',
  timeoutMs: 8000,
  cacheTtlMs: 86400000,
  maxEntries: 2,
  dailyRequestBudget: 450,
};

describe('Parallelum catalog boundary', () => {
  let request: jest.MockedFunction<typeof fetch>;
  let catalog: ParallelumCatalog;
  let now: number;

  beforeEach(() => {
    now = Date.UTC(2026, 8, 18);
    request = jest.fn();
    request.mockImplementation(() =>
      Promise.resolve(Response.json([{ code: '59', name: 'Marca de teste' }])),
    );
    catalog = new ParallelumCatalog(settings, request, () => now);
  });

  it('caches real responses for 24h and preserves the actual retrieval instant', async () => {
    const first = await catalog.brands();
    now += 3600000;
    const second = await catalog.brands();
    expect(second).toMatchObject({ ...first, cached: true });
    expect(request).toHaveBeenCalledTimes(1);
    now += 86400000;
    expect((await catalog.brands()).retrievedAt).not.toBe(first.retrievedAt);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('coalesces simultaneous requests and keys the cache by reference month', async () => {
    await Promise.all([
      catalog.models('59', '300'),
      catalog.models('59', '300'),
    ]);
    expect(request).toHaveBeenCalledTimes(1);
    await catalog.models('59', '301');
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0][0]).toBe(
      'https://catalog.example.test/v2/cars/brands/59/models?reference=300',
    );
  });

  it('refuses malformed upstream payloads without storing them in the cache', async () => {
    request.mockResolvedValueOnce(Response.json({ invented: true }));
    await expect(catalog.brands()).rejects.toThrow('lista inválida');
    expect((await catalog.brands()).items).toHaveLength(1);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('stops upstream requests after 429 and explains the temporary limit', async () => {
    request.mockResolvedValueOnce(new Response('', { status: 429 }));
    await expect(catalog.brands()).rejects.toThrow('limite de consultas');
    await expect(catalog.models('59')).rejects.toThrow('Limite temporário');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('keeps cached pages available when the local request budget is exhausted', async () => {
    catalog = new ParallelumCatalog(
      { ...settings, dailyRequestBudget: 1 },
      request,
      () => now,
    );
    await catalog.brands();
    await expect(catalog.models('59')).rejects.toThrow('Limite temporário');
    expect((await catalog.brands()).cached).toBe(true);
  });

  it('bounds HTTP duration and maps network errors without leaking their contents', async () => {
    request.mockRejectedValueOnce(new Error('private token transport detail'));
    await expect(catalog.brands()).rejects.toThrow(
      'Consulta de referência indisponível',
    );
    expect(request.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });
});
