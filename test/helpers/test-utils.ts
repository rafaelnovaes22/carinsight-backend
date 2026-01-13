import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../src/prisma/prisma.service';
import * as request from 'supertest';

/**
 * Cria uma aplicação de teste com todas as configurações necessárias
 */
export async function createTestApp(module: any): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [module],
  }).compile();

  const app = moduleFixture.createNestApplication();

  // Aplicar pipes globais (mesmas configurações do main.ts)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.init();
  return app;
}

/**
 * Limpa o banco de dados de teste
 */
export async function cleanDatabase(prisma: PrismaService): Promise<void> {
  // Ordem de deleção respeitando foreign keys
  await prisma.userInteraction.deleteMany();
  await prisma.vehicleMedia.deleteMany();
  await prisma.vehicle.deleteMany();
  await prisma.dealer.deleteMany();
  await prisma.user.deleteMany();
}

/**
 * Helper para fazer requisições autenticadas
 */
export class AuthenticatedRequest {
  private token: string;
  private app: INestApplication;

  constructor(app: INestApplication, token: string) {
    this.app = app;
    this.token = token;
  }

  get(url: string) {
    return request(this.app.getHttpServer())
      .get(url)
      .set('Authorization', `Bearer ${this.token}`);
  }

  post(url: string) {
    return request(this.app.getHttpServer())
      .post(url)
      .set('Authorization', `Bearer ${this.token}`);
  }

  patch(url: string) {
    return request(this.app.getHttpServer())
      .patch(url)
      .set('Authorization', `Bearer ${this.token}`);
  }

  delete(url: string) {
    return request(this.app.getHttpServer())
      .delete(url)
      .set('Authorization', `Bearer ${this.token}`);
  }
}

/**
 * Aguarda até que uma condição seja verdadeira
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout = 5000,
  interval = 100,
): Promise<void> {
  const startTime = Date.now();

  while (!(await condition())) {
    if (Date.now() - startTime > timeout) {
      throw new Error('Timeout waiting for condition');
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

/**
 * Gera dados aleatórios para testes
 */
export const TestDataGenerator = {
  email: () => `test-${Date.now()}@example.com`,
  uuid: () => crypto.randomUUID(),
  phoneNumber: () => `+55119${Math.floor(10000000 + Math.random() * 90000000)}`,
  cnpj: () =>
    `${Math.floor(10000000 + Math.random() * 90000000)}0001${Math.floor(10 + Math.random() * 90)}`,
  price: (min = 10000, max = 100000) =>
    Math.floor(Math.random() * (max - min + 1)) + min,
  mileage: (min = 0, max = 200000) =>
    Math.floor(Math.random() * (max - min + 1)) + min,
  year: (min = 2015, max = 2024) =>
    Math.floor(Math.random() * (max - min + 1)) + min,
};
