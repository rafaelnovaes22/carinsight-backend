import { Module } from '@nestjs/common';
import { CatalogProvider } from './catalog.types';
import { ParallelumCatalog } from './parallelum-catalog';
import { catalogSettings } from './catalog-settings';
import { CatalogController } from './catalog.controller';

@Module({
  controllers: [CatalogController],
  providers: [
    {
      provide: CatalogProvider,
      useFactory: (): CatalogProvider =>
        new ParallelumCatalog(catalogSettings()),
    },
  ],
  exports: [CatalogProvider],
})
export class CatalogModule {}
