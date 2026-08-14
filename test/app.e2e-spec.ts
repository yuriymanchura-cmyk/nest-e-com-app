import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { Role } from '../src/generated/prisma/enums';

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

function hasId(value: unknown): value is { id: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string'
  );
}

function hasCart(value: unknown): value is {
  id: string | null;
  items: Array<{
    id: string;
    quantity: number;
    product: { id: string; name: string; slug: string; price: string };
  }>;
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    (typeof value.id === 'string' || value.id === null) &&
    'items' in value &&
    Array.isArray(value.items)
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

  it('/categories (POST) allows only admins to create a category', async () => {
    const email = `e2e-category-${randomUUID()}@example.com`;
    const password = 'secure-password-123';
    const slug = `category-${randomUUID()}`;
    const prisma = app.get(PrismaService);

    try {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password })
        .expect(201);

      const customerLoginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(200);

      if (!hasAccessToken(customerLoginResponse.body)) {
        throw new Error('Expected an access token');
      }

      await request(app.getHttpServer())
        .post('/categories')
        .set(
          'Authorization',
          `Bearer ${customerLoginResponse.body.accessToken}`,
        )
        .send({ name: 'E2E Category', slug })
        .expect(403);

      await prisma.user.update({
        where: { email },
        data: { role: Role.ADMIN },
      });

      const adminLoginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(200);

      if (!hasAccessToken(adminLoginResponse.body)) {
        throw new Error('Expected an admin access token');
      }

      await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${adminLoginResponse.body.accessToken}`)
        .send({ name: 'E2E Category', slug })
        .expect(201);

      await request(app.getHttpServer()).get('/categories').expect(200);
    } finally {
      await prisma.category.deleteMany({ where: { slug } });
      await prisma.user.deleteMany({ where: { email } });
    }
  });

  it('/products supports admin creation and public listing/detail', async () => {
    const email = `e2e-product-${randomUUID()}@example.com`;
    const password = 'secure-password-123';
    const categorySlug = `e2e-category-${randomUUID()}`;
    const productSlug = `e2e-product-${randomUUID()}`;
    const prisma = app.get(PrismaService);

    try {
      const category = await prisma.category.create({
        data: {
          name: `E2E Category ${randomUUID()}`,
          slug: categorySlug,
        },
      });

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password })
        .expect(201);

      const customerLoginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(200);

      if (!hasAccessToken(customerLoginResponse.body)) {
        throw new Error('Expected a customer access token');
      }

      const productDto = {
        name: 'E2E Product',
        slug: productSlug,
        description: 'Product created by an e2e test.',
        price: '99.99',
        stock: 10,
        categoryId: category.id,
      };

      await request(app.getHttpServer())
        .post('/products')
        .set(
          'Authorization',
          `Bearer ${customerLoginResponse.body.accessToken}`,
        )
        .send(productDto)
        .expect(403);

      await prisma.user.update({
        where: { email },
        data: { role: Role.ADMIN },
      });

      const adminLoginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(200);

      if (!hasAccessToken(adminLoginResponse.body)) {
        throw new Error('Expected an admin access token');
      }

      const createResponse = await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${adminLoginResponse.body.accessToken}`)
        .send(productDto)
        .expect(201);

      if (!hasId(createResponse.body)) {
        throw new Error('Expected created product id');
      }

      expect(createResponse.body).toMatchObject({
        name: productDto.name,
        slug: productDto.slug,
        price: productDto.price,
        stock: productDto.stock,
        isActive: true,
        categoryId: category.id,
      });

      await request(app.getHttpServer())
        .patch(`/products/${createResponse.body.id}`)
        .set(
          'Authorization',
          `Bearer ${customerLoginResponse.body.accessToken}`,
        )
        .send({ stock: 0 })
        .expect(403);

      const updateResponse = await request(app.getHttpServer())
        .patch(`/products/${createResponse.body.id}`)
        .set('Authorization', `Bearer ${adminLoginResponse.body.accessToken}`)
        .send({ stock: 7 })
        .expect(200);

      expect(updateResponse.body).toMatchObject({
        id: createResponse.body.id,
        stock: 7,
      });

      await request(app.getHttpServer())
        .patch(`/products/${createResponse.body.id}`)
        .set('Authorization', `Bearer ${adminLoginResponse.body.accessToken}`)
        .send({})
        .expect(400);

      const productsResponse = await request(app.getHttpServer())
        .get('/products')
        .expect(200);

      expect(productsResponse.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: productDto.name,
            slug: productDto.slug,
            price: productDto.price,
            category: {
              id: category.id,
              name: category.name,
              slug: category.slug,
            },
          }),
        ]),
      );

      const productResponse = await request(app.getHttpServer())
        .get(`/products/${productDto.slug}`)
        .expect(200);

      expect(productResponse.body).toMatchObject({
        name: productDto.name,
        slug: productDto.slug,
        price: productDto.price,
        category: {
          id: category.id,
          name: category.name,
          slug: category.slug,
        },
      });
      expect(productResponse.body).not.toHaveProperty('stock');
      expect(productResponse.body).not.toHaveProperty('isActive');

      const deactivateResponse = await request(app.getHttpServer())
        .patch(`/products/${createResponse.body.id}`)
        .set('Authorization', `Bearer ${adminLoginResponse.body.accessToken}`)
        .send({ isActive: false })
        .expect(200);

      expect(deactivateResponse.body).toMatchObject({
        id: createResponse.body.id,
        isActive: false,
      });

      await request(app.getHttpServer())
        .get(`/products/${productDto.slug}`)
        .expect(404);

      await request(app.getHttpServer())
        .get('/products/does-not-exist')
        .expect(404);
    } finally {
      await prisma.product.deleteMany({ where: { slug: productSlug } });
      await prisma.category.deleteMany({ where: { slug: categorySlug } });
      await prisma.user.deleteMany({ where: { email } });
    }
  });

  it('/cart supports an authenticated item lifecycle', async () => {
    const email = `e2e-cart-${randomUUID()}@example.com`;
    const password = 'secure-password-123';
    const categorySlug = `e2e-cart-category-${randomUUID()}`;
    const productSlug = `e2e-cart-product-${randomUUID()}`;
    const prisma = app.get(PrismaService);

    try {
      const category = await prisma.category.create({
        data: {
          name: `E2E Cart Category ${randomUUID()}`,
          slug: categorySlug,
        },
      });

      const product = await prisma.product.create({
        data: {
          name: 'E2E Cart Product',
          slug: productSlug,
          description: 'Product used by the cart e2e test.',
          price: '99.99',
          stock: 10,
          categoryId: category.id,
        },
      });

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password })
        .expect(201);

      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(200);

      if (!hasAccessToken(loginResponse.body)) {
        throw new Error('Expected a cart user access token');
      }

      const authorization = `Bearer ${loginResponse.body.accessToken}`;

      await request(app.getHttpServer()).get('/cart').expect(401);

      const addResponse = await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', authorization)
        .send({ productId: product.id, quantity: 2 })
        .expect(201);

      if (!hasCart(addResponse.body) || addResponse.body.items.length !== 1) {
        throw new Error('Expected one item in the cart');
      }

      const itemId = addResponse.body.items[0].id;
      expect(addResponse.body.items[0]).toMatchObject({
        quantity: 2,
        product: {
          id: product.id,
          name: product.name,
          slug: product.slug,
          price: '99.99',
        },
      });

      const incrementResponse = await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', authorization)
        .send({ productId: product.id, quantity: 3 })
        .expect(201);

      if (!hasCart(incrementResponse.body)) {
        throw new Error('Expected the cart after incrementing an item');
      }

      expect(incrementResponse.body.items).toHaveLength(1);
      expect(incrementResponse.body.items[0]).toMatchObject({
        id: itemId,
        quantity: 5,
      });

      const updateResponse = await request(app.getHttpServer())
        .patch(`/cart/items/${itemId}`)
        .set('Authorization', authorization)
        .send({ quantity: 4 })
        .expect(200);

      if (!hasCart(updateResponse.body)) {
        throw new Error('Expected the cart after updating an item');
      }

      expect(updateResponse.body.items[0]).toMatchObject({
        id: itemId,
        quantity: 4,
      });

      const removeResponse = await request(app.getHttpServer())
        .delete(`/cart/items/${itemId}`)
        .set('Authorization', authorization)
        .expect(200);

      if (!hasCart(removeResponse.body)) {
        throw new Error('Expected the cart after removing an item');
      }

      expect(removeResponse.body.items).toEqual([]);

      await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', authorization)
        .send({ productId: product.id, quantity: 1 })
        .expect(201);

      const clearResponse = await request(app.getHttpServer())
        .delete('/cart')
        .set('Authorization', authorization)
        .expect(200);

      if (!hasCart(clearResponse.body)) {
        throw new Error('Expected the cart after clearing it');
      }

      expect(clearResponse.body.items).toEqual([]);
    } finally {
      await prisma.user.deleteMany({ where: { email } });
      await prisma.product.deleteMany({ where: { slug: productSlug } });
      await prisma.category.deleteMany({ where: { slug: categorySlug } });
    }
  });

  afterEach(async () => {
    await app.close();
  });
});
