import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

describe('VehiclesController (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let dealerId: string;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    //Import ValidationPipe
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    // Importante: validar pipes globais também no E2E se definido no main.ts, 
    // mas AppModule geralmente não aplica pipes globais automaticamente a menos que configurado.
    // O test-utils.ts tem createTestApp helper, mas aqui estamos usando padrão manual.
    // Vamos assumir validação básica por enquanto.

    await app.init();
    prisma = app.get(PrismaService);

    // Setup data
    await prisma.vehicle.deleteMany();
    await prisma.dealer.deleteMany();
    await prisma.user.deleteMany();

    const user = await prisma.user.create({
      data: {
        email: 'dealer@test.com',
        passwordHash: 'hash',
        name: 'Dealer Test',
        role: 'DEALER',
      },
    });

    const dealer = await prisma.dealer.create({
      data: {
        userId: user.id,
        name: 'Test Auto',
        contactInfo: {},
        verificationStatus: 'VERIFIED',
      },
    });

    dealerId = dealer.id;
  });

  afterAll(async () => {
    await prisma.vehicle.deleteMany();
    await prisma.dealer.deleteMany();
    await prisma.user.deleteMany();
    await app.close();
  });

  it('/vehicles (POST) should create a vehicle', async () => {
    const createDto = {
      dealerId: dealerId,
      title: 'Civic 2024',
      make: 'Honda',
      model: 'Civic',
      yearModel: 2024,
      yearFab: 2024,
      price: 150000,
      mileage: 0,
      condition: 'NEW',
      bodyType: 'Sedan',
      technicalSpecs: {},
      features: ['Automatic'],
    };

    return request(app.getHttpServer())
      .post('/vehicles')
      .send(createDto)
      .expect(201)
      .expect((res) => {
        expect(res.body.title).toEqual('Civic 2024');
        expect(res.body.id).toBeDefined();
        // ValidationPipe pode não estar ativo se não configurado explicitamente no teste
        // Ver main.ts
      });
  });

  it('/vehicles (POST) should fail with invalid data', () => {
    return request(app.getHttpServer())
      .post('/vehicles')
      .send({ title: 'Invalid Car' }) // Missing required fields
      .expect(400);
  });

  it('/vehicles (GET) should return array', () => {
    return request(app.getHttpServer())
      .get('/vehicles')
      .expect(200)
      .expect((res) => {
        expect(Array.isArray(res.body)).toBe(true);
      });
  });

  it('/vehicles/:id (GET) should return 404 for non-existent', () => {
    return request(app.getHttpServer())
      .get('/vehicles/00000000-0000-0000-0000-000000000000')
      .expect(404);
  });
});
