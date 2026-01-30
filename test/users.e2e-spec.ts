import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

describe('UsersController (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let userToken: string;
  let testUserId: string;

  const adminUser = {
    email: 'admin@carinsight.com',
    password: 'adminPassword123',
    name: 'Admin User',
  };

  const regularUser = {
    email: 'user@carinsight.com',
    password: 'userPassword123',
    name: 'Regular User',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );

    await app.init();
    prisma = app.get(PrismaService);

    // Clean up
    await prisma.userInteraction.deleteMany();
    await prisma.user.deleteMany({
      where: {
        email: { in: [adminUser.email, regularUser.email, 'newuser@test.com'] },
      },
    });

    // Create admin user directly in DB with proper hash
    const adminPasswordHash = await bcrypt.hash(adminUser.password, 12);
    await prisma.user.create({
      data: {
        email: adminUser.email,
        passwordHash: adminPasswordHash,
        name: adminUser.name,
        role: 'ADMIN',
      },
    });

    // Login as admin
    const adminLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: adminUser.email, password: adminUser.password });
    adminToken = adminLogin.body.accessToken;

    // Register regular user
    const userRegister = await request(app.getHttpServer())
      .post('/auth/register')
      .send(regularUser);
    userToken = userRegister.body.accessToken;
    testUserId = userRegister.body.user.id;
  });

  afterAll(async () => {
    await prisma.userInteraction.deleteMany();
    await prisma.user.deleteMany({
      where: {
        email: { in: [adminUser.email, regularUser.email, 'newuser@test.com'] },
      },
    });
    await app.close();
  });

  describe('/users (GET) - Admin only', () => {
    it('should return users list for admin', async () => {
      const response = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('meta');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should filter users by role', async () => {
      const response = await request(app.getHttpServer())
        .get('/users?role=CUSTOMER')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      response.body.data.forEach((user: { role: string }) => {
        expect(user.role).toBe('CUSTOMER');
      });
    });

    it('should deny access for regular user', async () => {
      await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });

    it('should deny access without token', async () => {
      await request(app.getHttpServer()).get('/users').expect(401);
    });
  });

  describe('/users/me (GET)', () => {
    it('should return current user data', async () => {
      const response = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.email).toBe(regularUser.email);
      expect(response.body.name).toBe(regularUser.name);
      expect(response.body).not.toHaveProperty('passwordHash');
    });
  });

  describe('/users/me (PATCH)', () => {
    it('should update current user name', async () => {
      const response = await request(app.getHttpServer())
        .patch('/users/me')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ name: 'Updated Name' })
        .expect(200);

      expect(response.body.name).toBe('Updated Name');
    });

    it('should update preferences', async () => {
      const response = await request(app.getHttpServer())
        .patch('/users/me')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ preferences: { theme: 'dark', budget: 100000 } })
        .expect(200);

      expect(response.body.preferences).toMatchObject({
        theme: 'dark',
        budget: 100000,
      });
    });
  });

  describe('/users/me/password (PATCH)', () => {
    it('should update password with correct current password', async () => {
      const response = await request(app.getHttpServer())
        .patch('/users/me/password')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          currentPassword: regularUser.password,
          newPassword: 'newPassword456',
        })
        .expect(200);

      expect(response.body.message).toBe('Senha atualizada com sucesso');

      // Update password back for other tests
      await request(app.getHttpServer())
        .patch('/users/me/password')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          currentPassword: 'newPassword456',
          newPassword: regularUser.password,
        });
    });

    it('should fail with wrong current password', async () => {
      await request(app.getHttpServer())
        .patch('/users/me/password')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          currentPassword: 'wrongPassword',
          newPassword: 'newPassword456',
        })
        .expect(400);
    });
  });

  describe('/users/:id (GET) - Admin only', () => {
    it('should return user by id for admin', async () => {
      const response = await request(app.getHttpServer())
        .get(`/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.id).toBe(testUserId);
    });

    it('should return 404 for non-existent user', async () => {
      await request(app.getHttpServer())
        .get('/users/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('should deny access for regular user', async () => {
      await request(app.getHttpServer())
        .get(`/users/${testUserId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });
  });

  describe('/users (POST) - Admin only', () => {
    it('should create user as admin', async () => {
      const response = await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'newuser@test.com',
          password: 'password123',
          name: 'New User',
          role: 'DEALER',
        })
        .expect(201);

      expect(response.body.email).toBe('newuser@test.com');
      expect(response.body.role).toBe('DEALER');
    });

    it('should deny creation for regular user', async () => {
      await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          email: 'another@test.com',
          password: 'password123',
          name: 'Another User',
        })
        .expect(403);
    });
  });
});
