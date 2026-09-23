import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: PrismaService,
          useValue: { $queryRaw: jest.fn().mockResolvedValue(1) },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('redireciona a raiz para a origem do frontend', () => {
      expect(appController.getHello()).toEqual({
        url: expect.stringMatching(/^https:\/\//),
        statusCode: 302,
      });
    });

    it('health retorna ok quando o banco responde', async () => {
      await expect(appController.health()).resolves.toEqual({ status: 'ok' });
    });
  });
});
