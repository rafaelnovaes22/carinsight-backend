import {
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CatalogSettings } from './catalog-settings';
import { catalogChoices, catalogValuation } from './catalog-parsing';
import {
  CatalogList,
  CatalogProvenance,
  CatalogProvider,
  CatalogValuation,
} from './catalog.types';

interface CachedDocument {
  payload: unknown;
  retrievedAt: string;
  expiresAt: number;
}

interface CatalogDocument<T> extends CatalogProvenance {
  value: T;
}

// API v2 paths and monthly reference parameter: https://deividfortuna.github.io/fipe/v2/
export class ParallelumCatalog extends CatalogProvider {
  private readonly cache = new Map<string, CachedDocument>();
  private readonly inflight = new Map<string, Promise<CachedDocument>>();
  private budgetStarted = 0;
  private requestsUsed = 0;
  private blockedUntil = 0;

  constructor(
    private readonly settings: CatalogSettings,
    private readonly request: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {
    super();
  }

  async brands(reference?: string): Promise<CatalogList> {
    return this.list('cars/brands', reference);
  }

  async models(brandId: string, reference?: string): Promise<CatalogList> {
    return this.list(`cars/brands/${brandId}/models`, reference);
  }

  async years(
    brandId: string,
    modelId: string,
    reference?: string,
  ): Promise<CatalogList> {
    return this.list(
      `cars/brands/${brandId}/models/${modelId}/years`,
      reference,
    );
  }

  async valuation(
    brandId: string,
    modelId: string,
    yearId: string,
    reference?: string,
  ): Promise<CatalogValuation> {
    const path = `cars/brands/${brandId}/models/${modelId}/years/${yearId}`;
    const { value, ...provenance } = await this.read(
      path,
      reference,
      catalogValuation,
    );
    return { ...value, ...provenance };
  }

  private async list(path: string, reference?: string): Promise<CatalogList> {
    const { value, ...provenance } = await this.read(
      path,
      reference,
      catalogChoices,
    );
    return { items: value, ...provenance };
  }

  private async read<T>(
    path: string,
    reference: string | undefined,
    parse: (input: unknown) => T,
  ): Promise<CatalogDocument<T>> {
    const url = new URL(`${this.settings.baseUrl}/${path}`);
    if (reference) url.searchParams.set('reference', reference);
    const key = url.toString();
    const existing = this.cache.get(key);
    const cached = !!existing && existing.expiresAt > this.now();
    const document = cached ? existing : await this.refresh(key, parse);
    return {
      value: parse(document.payload),
      retrievedAt: document.retrievedAt,
      cached,
      source: {
        provider: 'parallelum',
        name: 'FIPE via Parallelum (provedor independente)',
        url: key,
      },
    };
  }

  private async refresh<T>(
    url: string,
    parse: (input: unknown) => T,
  ): Promise<CachedDocument> {
    const pending = this.inflight.get(url);
    if (pending) return pending;
    const request = this.download(url, parse);
    this.inflight.set(url, request);
    try {
      return await request;
    } finally {
      this.inflight.delete(url);
    }
  }

  private async download<T>(
    url: string,
    parse: (input: unknown) => T,
  ): Promise<CachedDocument> {
    this.reserveRequest();
    try {
      const response = await this.request(url, {
        headers: this.headers(),
        signal: AbortSignal.timeout(this.settings.timeoutMs),
        redirect: 'error',
      });
      this.assertResponse(response);
      const payload: unknown = await response.json();
      parse(payload);
      return this.remember(url, payload);
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException(
        'Consulta de referência indisponível no provedor. Tente novamente em instantes.',
      );
    }
  }

  private reserveRequest(): void {
    const now = this.now();
    if (now - this.budgetStarted >= 86400000) {
      this.budgetStarted = now;
      this.requestsUsed = 0;
    }
    if (
      now < this.blockedUntil ||
      this.requestsUsed >= this.settings.dailyRequestBudget
    ) {
      throw new ServiceUnavailableException(
        'Limite temporário de consultas de referência atingido. As consultas em cache continuam disponíveis.',
      );
    }
    this.requestsUsed += 1;
  }

  private assertResponse(response: Response): void {
    if (response.status === 404)
      throw new NotFoundException(
        'Referência não encontrada para marca, modelo, ano e mês informados',
      );
    if (response.status === 429) {
      this.blockedUntil = this.now() + 60000;
      throw new ServiceUnavailableException(
        'O provedor atingiu o limite de consultas. Aguarde antes de tentar novamente.',
      );
    }
    if (!response.ok)
      throw new ServiceUnavailableException(
        'O provedor de referências está temporariamente indisponível',
      );
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.settings.token)
      headers['X-Subscription-Token'] = this.settings.token;
    return headers;
  }

  private remember(url: string, payload: unknown): CachedDocument {
    if (this.cache.size >= this.settings.maxEntries) {
      const oldest: unknown = this.cache.keys().next().value;
      if (typeof oldest === 'string') this.cache.delete(oldest);
    }
    const now = this.now();
    const entry = {
      payload,
      retrievedAt: new Date(now).toISOString(),
      expiresAt: now + this.settings.cacheTtlMs,
    };
    this.cache.set(url, entry);
    return entry;
  }
}
