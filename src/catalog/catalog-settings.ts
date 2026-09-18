export interface CatalogSettings {
  baseUrl: string;
  token?: string;
  timeoutMs: number;
  cacheTtlMs: number;
  maxEntries: number;
  dailyRequestBudget: number;
}

export function catalogSettings(): CatalogSettings {
  const baseUrl =
    process.env.CATALOG_API_URL ?? 'https://fipe.parallelum.com.br/api/v2';
  const parsed = new URL(baseUrl);
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(
      'CATALOG_API_URL deve ser uma URL HTTPS sem credenciais, parâmetros ou fragmento',
    );
  }
  return {
    baseUrl: baseUrl.replace(/\/$/, ''),
    token: process.env.FIPE_API_TOKEN,
    timeoutMs: 8000,
    cacheTtlMs: 86400000,
    maxEntries: 500,
    dailyRequestBudget: 450,
  };
}
