import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

function hasAccessToken(value: unknown): value is { accessToken: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'accessToken' in value &&
    typeof value.accessToken === 'string'
  );
}

function hasTokenPair(
  value: unknown,
): value is { accessToken: string; refreshToken: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'accessToken' in value &&
    typeof value.accessToken === 'string' &&
    'refreshToken' in value &&
    typeof value.refreshToken === 'string'
  );
}

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('/auth/login (POST)', async () => {
    const email = `e2e-${randomUUID()}@example.com`;
    const password = 'secure-password-123';
    const prisma = app.get(PrismaService);

    try {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password })
        .expect(201);

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(200);

      if (!hasAccessToken(response.body)) {
        throw new Error('Expected an access token');
      }

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${response.body.accessToken}`)
        .expect(200);
    } finally {
      await prisma.user.deleteMany({ where: { email } });
    }
  });

  it('/auth/me (GET) rejects unauthenticated requests', () => {
    return request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('/auth/me (GET) rejects an invalid token', () => {
    return request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);
  });

  it('/auth/refresh (POST) rotates refresh tokens', async () => {
    const email = `e2e-refresh-${randomUUID()}@example.com`;
    const password = 'secure-password-123';
    const prisma = app.get(PrismaService);

    try {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password })
        .expect(201);

      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(200);

      if (!hasTokenPair(loginResponse.body)) {
        throw new Error('Expected access and refresh tokens');
      }

      const oldRefreshToken = loginResponse.body.refreshToken;

      const refreshResponse = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: oldRefreshToken })
        .expect(200);

      if (!hasTokenPair(refreshResponse.body)) {
        throw new Error('Expected rotated access and refresh tokens');
      }

      expect(refreshResponse.body.refreshToken).not.toBe(oldRefreshToken);

      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: oldRefreshToken })
        .expect(401);
    } finally {
      await prisma.user.deleteMany({ where: { email } });
    }
  });

  it('/auth/logout (POST) revokes the refresh token session', async () => {
    const email = `e2e-logout-${randomUUID()}@example.com`;
    const password = 'secure-password-123';
    const prisma = app.get(PrismaService);

    try {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password })
        .expect(201);

      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(200);

      if (!hasTokenPair(loginResponse.body)) {
        throw new Error('Expected access and refresh tokens');
      }

      const refreshToken = loginResponse.body.refreshToken;

      await request(app.getHttpServer())
        .post('/auth/logout')
        .send({ refreshToken })
        .expect(204);

      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(401);
    } finally {
      await prisma.user.deleteMany({ where: { email } });
    }
  });

  it('/auth/password (PATCH) changes password and revokes refresh sessions', async () => {
    const email = `e2e-password-${randomUUID()}@example.com`;
    const currentPassword = 'secure-password-123';
    const newPassword = 'new-secure-password-123';
    const prisma = app.get(PrismaService);

    try {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password: currentPassword })
        .expect(201);

      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: currentPassword })
        .expect(200);

      if (!hasTokenPair(loginResponse.body)) {
        throw new Error('Expected access and refresh tokens');
      }

      await request(app.getHttpServer())
        .patch('/auth/password')
        .set('Authorization', `Bearer ${loginResponse.body.accessToken}`)
        .send({ currentPassword, newPassword })
        .expect(204);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: currentPassword })
        .expect(401);

      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: loginResponse.body.refreshToken })
        .expect(401);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: newPassword })
        .expect(200);
    } finally {
      await prisma.user.deleteMany({ where: { email } });
    }
  });

  afterEach(async () => {
    await app.close();
  });
});
