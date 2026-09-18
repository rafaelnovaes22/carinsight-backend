import { Test } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';

describe('Application entry points', () => {
  const query = jest.fn();
  let controller: AppController;

  beforeEach(async () => {
    query.mockReset();
    const app = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        { provide: PrismaService, useValue: { $queryRaw: query } },
      ],
    }).compile();
    controller = app.get(AppController);
  });

  it('redirects the root to the human-facing product', () => {
    const result = controller.getHello();
    expect(result.statusCode).toBe(302);
    expect(new URL(result.url).protocol).toBe('https:');
  });

  it('reports health only when the database answers', async () => {
    query.mockResolvedValue([{ result: 1 }]);
    await expect(controller.health()).resolves.toEqual({ status: 'ok' });
  });

  it('returns unavailable without exposing database errors', async () => {
    query.mockRejectedValue(new Error('private connection detail'));
    await expect(controller.health()).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
