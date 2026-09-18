export interface CatalogChoice {
  code: string;
  name: string;
}

export interface CatalogSource {
  provider: string;
  name: string;
  url: string;
}

export interface CatalogProvenance {
  source: CatalogSource;
  retrievedAt: string;
  cached: boolean;
}

export interface CatalogList extends CatalogProvenance {
  items: CatalogChoice[];
}

export interface CatalogValuation extends CatalogProvenance {
  kind: 'reference_valuation';
  brand: string;
  model: string;
  modelYear: number;
  fuel: string;
  codeFipe: string;
  price: number;
  priceFormatted: string;
  currency: 'BRL';
  referenceMonth: string;
  disclaimer: string;
}

export abstract class CatalogProvider {
  abstract brands(reference?: string): Promise<CatalogList>;
  abstract models(brandId: string, reference?: string): Promise<CatalogList>;
  abstract years(
    brandId: string,
    modelId: string,
    reference?: string,
  ): Promise<CatalogList>;
  abstract valuation(
    brandId: string,
    modelId: string,
    yearId: string,
    reference?: string,
  ): Promise<CatalogValuation>;
}
