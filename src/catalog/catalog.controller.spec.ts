import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CatalogController } from './catalog.controller';
import { CatalogProvider } from './catalog.types';

describe('Reference catalog HTTP contract', () => {
  let app: INestApplication;
  const catalog = {
    brands: jest.fn(),
    models: jest.fn(),
    years: jest.fn(),
    valuation: jest.fn(),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [CatalogController],
      providers: [{ provide: CatalogProvider, useValue: catalog }],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });

  it('rejects path injection and extra query fields before contacting the provider', async () => {
    await request(app.getHttpServer())
      .get('/catalog/models?brandId=../admin')
      .expect(400);
    await request(app.getHttpServer())
      .get('/catalog/brands?token=secret')
      .expect(400);
    expect(catalog.models).not.toHaveBeenCalled();
  });

  it('preserves the model-year code and explicit monthly reference', async () => {
    catalog.valuation.mockResolvedValue({
      kind: 'reference_valuation',
      price: 89000,
    });
    await request(app.getHttpServer())
      .get(
        '/catalog/valuation?brandId=59&modelId=5940&yearId=2014-3&reference=300',
      )
      .expect(200)
      .expect({ kind: 'reference_valuation', price: 89000 });
    expect(catalog.valuation).toHaveBeenCalledWith(
      '59',
      '5940',
      '2014-3',
      '300',
    );
  });
});
