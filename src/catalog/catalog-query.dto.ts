import { IsOptional, IsString, Matches } from 'class-validator';

export class CatalogReferenceQuery {
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,6}$/)
  reference?: string;
}

export class CatalogModelsQuery extends CatalogReferenceQuery {
  @IsString()
  @Matches(/^\d{1,8}$/)
  brandId: string;
}

export class CatalogYearsQuery extends CatalogModelsQuery {
  @IsString()
  @Matches(/^\d{1,8}$/)
  modelId: string;
}

export class CatalogValuationQuery extends CatalogYearsQuery {
  @IsString()
  @Matches(/^\d{4,5}-\d$/)
  yearId: string;
}
