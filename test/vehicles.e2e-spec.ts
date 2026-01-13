import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('VehiclesController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // Note: This test assumes database connectivity is handled or mocked in AppModule for E2E.
  // Ideally for CI/CD, we have a service container.

  it('/vehicles (GET)', () => {
    return request(app.getHttpServer()).get('/vehicles').expect(200);
  });
});
