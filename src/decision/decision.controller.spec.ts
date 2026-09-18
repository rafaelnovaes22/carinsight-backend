import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DecisionController } from './decision.controller';
import { DecisionBriefing } from './decision-briefing';

describe('Decision briefing HTTP input boundary', () => {
  let app: INestApplication;
  const briefing = { create: jest.fn() };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [DecisionController],
      providers: [{ provide: DecisionBriefing, useValue: briefing }],
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
  beforeEach(() => {
    briefing.create.mockReset();
  });

  it('rejects sensitive nested fields, empty text and unbounded requests', async () => {
    await request(app.getHttpServer())
      .post('/decision/brief')
      .send({ naturalLanguage: 'Meu carro', constraints: { income: 5000 } })
      .expect(400);
    await request(app.getHttpServer())
      .post('/decision/brief')
      .send({ naturalLanguage: '   ' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/decision/brief')
      .send({ naturalLanguage: 'x'.repeat(1501) })
      .expect(400);
    expect(briefing.create).not.toHaveBeenCalled();
  });

  it('returns explicit interpretation mode for a valid constrained request', async () => {
    briefing.create.mockResolvedValue({
      interpretation: 'rules',
      profile: { budgetMax: 75000 },
    });
    await request(app.getHttpServer())
      .post('/decision/brief')
      .send({
        naturalLanguage: 'Quero hatch',
        constraints: { budgetMax: 75000 },
      })
      .expect(200)
      .expect({ interpretation: 'rules', profile: { budgetMax: 75000 } });
  });
});
