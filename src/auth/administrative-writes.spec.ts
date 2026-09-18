import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthModule } from './auth.module';
import { AuthService, JwtPayload } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { VehiclesController } from '../vehicles/vehicles.controller';
import { VehiclesService } from '../vehicles/vehicles.service';
import { DealersController } from '../dealers/dealers.controller';
import { DealersService } from '../dealers/dealers.service';

describe('Administrative writes HTTP authorization', () => {
  let app: INestApplication;
  let jwt: JwtService;
  const id = '55e65aac-11a1-46ae-9c6a-a3de3389b42c';
  const vehicles = { remove: jest.fn() };
  const dealers = { remove: jest.fn() };
  const auth = {
    register: jest.fn(),
    validateUser: jest.fn((payload: JwtPayload) =>
      Promise.resolve({
        id: payload.sub,
        email: payload.email,
        role: payload.role,
      }),
    ),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AuthModule],
      controllers: [VehiclesController, DealersController],
      providers: [
        { provide: VehiclesService, useValue: vehicles },
        { provide: DealersService, useValue: dealers },
      ],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(AuthService)
      .useValue(auth)
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    jwt = module.get(JwtService);
    await app.init();
  });
  beforeEach(() => {
    jest.clearAllMocks();
  });
  afterAll(async () => {
    await app.close();
  });

  it.each(['/vehicles', '/dealers'])(
    'rejects anonymous writes to %s before mutation',
    async (route) => {
      await request(app.getHttpServer()).delete(`${route}/${id}`).expect(401);
      expect(vehicles.remove).not.toHaveBeenCalled();
      expect(dealers.remove).not.toHaveBeenCalled();
    },
  );

  it.each(['CUSTOMER', 'DEALER'])(
    'rejects %s on both administrative resources',
    async (role) => {
      const token = jwt.sign({ sub: id, email: 'unit@example.com', role });
      for (const route of ['/vehicles', '/dealers']) {
        await request(app.getHttpServer())
          .delete(`${route}/${id}`)
          .set('Authorization', `Bearer ${token}`)
          .expect(403);
      }
      expect(vehicles.remove).not.toHaveBeenCalled();
      expect(dealers.remove).not.toHaveBeenCalled();
    },
  );

  it('allows authenticated ADMIN mutations and rejects public ADMIN registration', async () => {
    const token = jwt.sign({
      sub: id,
      email: 'unit@example.com',
      role: 'ADMIN',
    });
    for (const route of ['/vehicles', '/dealers']) {
      await request(app.getHttpServer())
        .delete(`${route}/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    }
    expect(vehicles.remove).toHaveBeenCalledWith(id);
    expect(dealers.remove).toHaveBeenCalledWith(id);
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'unit@example.com',
        password: 'unit-password',
        name: 'Unit Test',
        role: 'ADMIN',
      })
      .expect(400);
    expect(auth.register).not.toHaveBeenCalled();
  });
});
