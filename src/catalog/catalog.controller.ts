import { Controller, Get, Query } from '@nestjs/common';
import {
  CatalogProvider,
  CatalogList,
  CatalogValuation,
} from './catalog.types';
import {
  CatalogModelsQuery,
  CatalogReferenceQuery,
  CatalogValuationQuery,
  CatalogYearsQuery,
} from './catalog-query.dto';

@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogProvider) {}

  @Get('brands')
  brands(@Query() query: CatalogReferenceQuery): Promise<CatalogList> {
    return this.catalog.brands(query.reference);
  }

  @Get('models')
  models(@Query() query: CatalogModelsQuery): Promise<CatalogList> {
    return this.catalog.models(query.brandId, query.reference);
  }

  @Get('years')
  years(@Query() query: CatalogYearsQuery): Promise<CatalogList> {
    return this.catalog.years(query.brandId, query.modelId, query.reference);
  }

  @Get('valuation')
  valuation(@Query() query: CatalogValuationQuery): Promise<CatalogValuation> {
    return this.catalog.valuation(
      query.brandId,
      query.modelId,
      query.yearId,
      query.reference,
    );
  }
}
