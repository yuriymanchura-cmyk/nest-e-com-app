import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Application } from 'express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import { HttpExceptionFilter } from '../src/common/http-exception/http-exception.filter';
import { AppModule } from '../src/app.module';
import { InventoryMovementType, Role } from '../src/generated/prisma/enums';
import { NotificationsService } from '../src/notifications/notifications.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';

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

function hasErrorResponse(value: unknown): value is {
  statusCode: number;
  message: string | string[];
  error: string;
  requestId: string;
  timestamp: string;
  path: string;
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    'statusCode' in value &&
    typeof value.statusCode === 'number' &&
    'message' in value &&
    (typeof value.message === 'string' || Array.isArray(value.message)) &&
    'error' in value &&
    typeof value.error === 'string' &&
    'requestId' in value &&
    typeof value.requestId === 'string' &&
    'timestamp' in value &&
    typeof value.timestamp === 'string' &&
    'path' in value &&
    typeof value.path === 'string'
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

function hasPaginatedProducts(value: unknown): value is {
  data: unknown[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    'data' in value &&
    Array.isArray(value.data) &&
    'meta' in value &&
    typeof value.meta === 'object' &&
    value.meta !== null &&
    'page' in value.meta &&
    typeof value.meta.page === 'number' &&
    'limit' in value.meta &&
    typeof value.meta.limit === 'number' &&
    'total' in value.meta &&
    typeof value.meta.total === 'number' &&
    'totalPages' in value.meta &&
    typeof value.meta.totalPages === 'number'
  );
}

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(NotificationsService)
      .useValue({
        sendOrderPaidConfirmation: jest.fn(),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    const expressApp = app.getHttpAdapter().getInstance() as Application;
    expressApp.set('trust proxy', 1);
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    const redisService = app.get(RedisService);

    await redisService.deleteByPattern('throttle:*');
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
      .expect({ status: 'ok', database: 'up', redis: 'up' });
  });

  it('returns a correlated error response for an HTTP exception', async () => {
    const response = await request(app.getHttpServer())
      .get('/products/does-not-exist')
      .expect(404);

    const responseBody: unknown = response.body;

    if (!hasErrorResponse(responseBody)) {
      throw new Error('Expected a standardized error response');
    }

    expect(response.headers['x-request-id']).toBe(responseBody.requestId);
    expect(responseBody).toMatchObject({
      statusCode: 404,
      message: 'Product not found',
      error: 'Not Found',
      path: '/products/does-not-exist',
    });
    expect(new Date(responseBody.timestamp).toString()).not.toBe(
      'Invalid Date',
    );
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

  it('/auth/login (POST) limits repeated requests', async () => {
    const rateLimitTestIp = `198.18.0.${Math.floor(Math.random() * 254) + 1}`;

    const login = () =>
      request(app.getHttpServer())
        .post('/auth/login')
        .set('X-Forwarded-For', rateLimitTestIp)
        .send({
          email: 'rate-limit@example.com',
          password: 'wrong-password-123',
        });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await login().expect(401);
    }

    const response = await login().expect(429);
    const responseBody: unknown = response.body;

    if (!hasErrorResponse(responseBody)) {
      throw new Error('Expected a standardized throttling error response');
    }

    expect(response.headers['retry-after']).toMatch(/^\d+$/);
    expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
    expect(responseBody.message).toBe('Too many requests. Try again later.');
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

      const initialStockMovement =
        await prisma.inventoryMovement.findFirstOrThrow({
          where: {
            productId: createResponse.body.id,
            type: InventoryMovementType.INITIAL_STOCK,
          },
          select: {
            quantity: true,
            stockBefore: true,
            stockAfter: true,
          },
        });

      expect(initialStockMovement).toEqual({
        quantity: productDto.stock,
        stockBefore: 0,
        stockAfter: productDto.stock,
      });

      await request(app.getHttpServer()).get('/products').expect(200);

      const cachedProductResponse = await request(app.getHttpServer())
        .get(`/products/${productDto.slug}`)
        .expect(200);

      expect(cachedProductResponse.body).toMatchObject({
        id: createResponse.body.id,
        price: productDto.price,
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
        .send({ price: '79.99' })
        .expect(200);

      expect(updateResponse.body).toMatchObject({
        id: createResponse.body.id,
        price: '79.99',
        stock: productDto.stock,
      });

      await request(app.getHttpServer())
        .patch(`/products/${createResponse.body.id}`)
        .set('Authorization', `Bearer ${adminLoginResponse.body.accessToken}`)
        .send({ stock: 7 })
        .expect(400);

      await request(app.getHttpServer())
        .patch(`/products/${createResponse.body.id}`)
        .set('Authorization', `Bearer ${adminLoginResponse.body.accessToken}`)
        .send({})
        .expect(400);

      const productsResponse = await request(app.getHttpServer())
        .get(
          `/products?search=${encodeURIComponent(productDto.name)}&categorySlug=${categorySlug}&sort=priceAsc&page=1&limit=1`,
        )
        .expect(200);

      if (!hasPaginatedProducts(productsResponse.body)) {
        throw new Error('Expected paginated products response');
      }

      expect(productsResponse.body).toMatchObject({
        data: [
          {
            name: productDto.name,
            slug: productDto.slug,
            price: '79.99',
            category: {
              id: category.id,
              name: category.name,
              slug: category.slug,
            },
          },
        ],
        meta: {
          page: 1,
          limit: 1,
        },
      });
      expect(productsResponse.body.meta.total).toBeGreaterThanOrEqual(1);
      expect(productsResponse.body.meta.totalPages).toBeGreaterThanOrEqual(1);

      await request(app.getHttpServer()).get('/products?page=0').expect(400);
      await request(app.getHttpServer()).get('/products?limit=51').expect(400);
      await request(app.getHttpServer())
        .get('/products?sort=invalid')
        .expect(400);

      const productResponse = await request(app.getHttpServer())
        .get(`/products/${productDto.slug}`)
        .expect(200);

      expect(productResponse.body).toMatchObject({
        name: productDto.name,
        slug: productDto.slug,
        price: '79.99',
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
      await prisma.inventoryMovement.deleteMany({
        where: { product: { slug: productSlug } },
      });
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
      await prisma.inventoryMovement.deleteMany({
        where: { product: { slug: productSlug } },
      });
      await prisma.product.deleteMany({ where: { slug: productSlug } });
      await prisma.category.deleteMany({ where: { slug: categorySlug } });
    }
  });

  it('/orders/checkout (POST) creates an order, decrements stock, and clears the cart', async () => {
    const email = `e2e-order-${randomUUID()}@example.com`;
    const password = 'secure-password-123';
    const categorySlug = `e2e-order-category-${randomUUID()}`;
    const productSlug = `e2e-order-product-${randomUUID()}`;
    const idempotencyKey = randomUUID();
    const prisma = app.get(PrismaService);

    try {
      const category = await prisma.category.create({
        data: {
          name: `E2E Order Category ${randomUUID()}`,
          slug: categorySlug,
        },
      });

      const product = await prisma.product.create({
        data: {
          name: 'E2E Order Product',
          slug: productSlug,
          description: 'Product used by the checkout e2e test.',
          price: '49.99',
          stock: 5,
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
        throw new Error('Expected an order user access token');
      }

      const authorization = `Bearer ${loginResponse.body.accessToken}`;

      await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', authorization)
        .send({ productId: product.id, quantity: 2 })
        .expect(201);

      const checkoutResponse = await request(app.getHttpServer())
        .post('/orders/checkout')
        .set('Authorization', authorization)
        .set('Idempotency-Key', idempotencyKey)
        .expect(201);

      if (!hasId(checkoutResponse.body)) {
        throw new Error('Expected created order id');
      }

      expect(checkoutResponse.body).toMatchObject({
        status: 'PENDING',
        subtotal: '99.98',
        totalAmount: '99.98',
        items: [
          expect.objectContaining({
            productId: product.id,
            productName: product.name,
            unitPrice: '49.99',
            quantity: 2,
            lineTotal: '99.98',
          }),
        ],
      });

      const updatedProduct = await prisma.product.findUniqueOrThrow({
        where: { id: product.id },
        select: { stock: true },
      });
      expect(updatedProduct.stock).toBe(3);

      const movement = await prisma.inventoryMovement.findFirstOrThrow({
        where: {
          productId: product.id,
          orderId: checkoutResponse.body.id,
          type: InventoryMovementType.ORDER_PLACED,
        },
        select: {
          quantity: true,
          stockBefore: true,
          stockAfter: true,
        },
      });

      expect(movement).toEqual({
        quantity: 2,
        stockBefore: 5,
        stockAfter: 3,
      });

      const cartResponse = await request(app.getHttpServer())
        .get('/cart')
        .set('Authorization', authorization)
        .expect(200);

      if (!hasCart(cartResponse.body)) {
        throw new Error('Expected the cart after checkout');
      }

      expect(cartResponse.body.items).toEqual([]);

      const ordersResponse = await request(app.getHttpServer())
        .get('/orders')
        .set('Authorization', authorization)
        .expect(200);

      expect(ordersResponse.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: checkoutResponse.body.id,
            status: 'PENDING',
            totalAmount: '99.98',
          }),
        ]),
      );

      await request(app.getHttpServer())
        .get(`/orders/${checkoutResponse.body.id}`)
        .set('Authorization', authorization)
        .expect(200);

      const repeatedCheckoutResponse = await request(app.getHttpServer())
        .post('/orders/checkout')
        .set('Authorization', authorization)
        .set('Idempotency-Key', idempotencyKey)
        .expect(201);

      expect(repeatedCheckoutResponse.body).toMatchObject({
        id: checkoutResponse.body.id,
        status: 'PENDING',
      });

      await request(app.getHttpServer())
        .post('/orders/checkout')
        .set('Authorization', authorization)
        .set('Idempotency-Key', randomUUID())
        .expect(400);
    } finally {
      await prisma.order.deleteMany({ where: { user: { email } } });
      await prisma.user.deleteMany({ where: { email } });
      await prisma.inventoryMovement.deleteMany({
        where: { product: { slug: productSlug } },
      });
      await prisma.product.deleteMany({ where: { slug: productSlug } });
      await prisma.category.deleteMany({ where: { slug: categorySlug } });
    }
  });

  it('/orders/checkout (POST) creates one order for concurrent requests with the same idempotency key', async () => {
    const email = `e2e-idempotency-${randomUUID()}@example.com`;
    const password = 'secure-password-123';
    const categorySlug = `e2e-idempotency-category-${randomUUID()}`;
    const productSlug = `e2e-idempotency-product-${randomUUID()}`;
    const idempotencyKey = randomUUID();
    const prisma = app.get(PrismaService);

    try {
      const category = await prisma.category.create({
        data: {
          name: `E2E Idempotency Category ${randomUUID()}`,
          slug: categorySlug,
        },
      });

      const product = await prisma.product.create({
        data: {
          name: 'E2E Idempotency Product',
          slug: productSlug,
          description: 'Product used by the idempotency e2e test.',
          price: '29.99',
          stock: 5,
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
        throw new Error('Expected an idempotency test access token');
      }

      const authorization = `Bearer ${loginResponse.body.accessToken}`;
      const user = await prisma.user.findUniqueOrThrow({
        where: { email },
        select: { id: true },
      });

      await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', authorization)
        .send({ productId: product.id, quantity: 1 })
        .expect(201);

      const [firstResponse, secondResponse] = await Promise.all([
        request(app.getHttpServer())
          .post('/orders/checkout')
          .set('Authorization', authorization)
          .set('Idempotency-Key', idempotencyKey),
        request(app.getHttpServer())
          .post('/orders/checkout')
          .set('Authorization', authorization)
          .set('Idempotency-Key', idempotencyKey),
      ]);

      expect(firstResponse.status).toBe(201);
      expect(secondResponse.status).toBe(201);

      if (!hasId(firstResponse.body) || !hasId(secondResponse.body)) {
        throw new Error('Expected both checkout requests to return an order');
      }

      expect(secondResponse.body.id).toBe(firstResponse.body.id);

      const [orderCount, updatedProduct] = await Promise.all([
        prisma.order.count({ where: { userId: user.id } }),
        prisma.product.findUniqueOrThrow({
          where: { id: product.id },
          select: { stock: true },
        }),
      ]);

      expect(orderCount).toBe(1);
      expect(updatedProduct.stock).toBe(4);
    } finally {
      await prisma.order.deleteMany({ where: { user: { email } } });
      await prisma.user.deleteMany({ where: { email } });
      await prisma.inventoryMovement.deleteMany({
        where: { product: { slug: productSlug } },
      });
      await prisma.product.deleteMany({ where: { slug: productSlug } });
      await prisma.category.deleteMany({ where: { slug: categorySlug } });
    }
  });

  it('/orders only exposes orders that belong to the authenticated user', async () => {
    const ownerEmail = `e2e-order-owner-${randomUUID()}@example.com`;
    const otherUserEmail = `e2e-order-other-${randomUUID()}@example.com`;
    const password = 'secure-password-123';
    const categorySlug = `e2e-order-access-category-${randomUUID()}`;
    const productSlug = `e2e-order-access-product-${randomUUID()}`;
    const prisma = app.get(PrismaService);

    try {
      const category = await prisma.category.create({
        data: {
          name: `E2E Order Access Category ${randomUUID()}`,
          slug: categorySlug,
        },
      });

      const product = await prisma.product.create({
        data: {
          name: 'E2E Order Access Product',
          slug: productSlug,
          description: 'Product used by the order ownership e2e test.',
          price: '19.99',
          stock: 5,
          categoryId: category.id,
        },
      });

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: ownerEmail, password })
        .expect(201);

      const ownerLoginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: ownerEmail, password })
        .expect(200);

      if (!hasAccessToken(ownerLoginResponse.body)) {
        throw new Error('Expected an order owner access token');
      }

      const ownerAuthorization = `Bearer ${ownerLoginResponse.body.accessToken}`;

      await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', ownerAuthorization)
        .send({ productId: product.id, quantity: 1 })
        .expect(201);

      const checkoutResponse = await request(app.getHttpServer())
        .post('/orders/checkout')
        .set('Authorization', ownerAuthorization)
        .set('Idempotency-Key', randomUUID())
        .expect(201);

      if (!hasId(checkoutResponse.body)) {
        throw new Error('Expected created order id');
      }

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: otherUserEmail, password })
        .expect(201);

      const otherUserLoginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: otherUserEmail, password })
        .expect(200);

      if (!hasAccessToken(otherUserLoginResponse.body)) {
        throw new Error('Expected another user access token');
      }

      const otherUserAuthorization = `Bearer ${otherUserLoginResponse.body.accessToken}`;

      await request(app.getHttpServer())
        .get(`/orders/${checkoutResponse.body.id}`)
        .set('Authorization', otherUserAuthorization)
        .expect(404);

      const otherUserOrdersResponse = await request(app.getHttpServer())
        .get('/orders')
        .set('Authorization', otherUserAuthorization)
        .expect(200);

      expect(otherUserOrdersResponse.body).toEqual([]);
    } finally {
      await prisma.order.deleteMany({ where: { user: { email: ownerEmail } } });
      await prisma.user.deleteMany({
        where: { email: { in: [ownerEmail, otherUserEmail] } },
      });
      await prisma.inventoryMovement.deleteMany({
        where: { product: { slug: productSlug } },
      });
      await prisma.product.deleteMany({ where: { slug: productSlug } });
      await prisma.category.deleteMany({ where: { slug: categorySlug } });
    }
  });

  it('/orders/:id/cancel (POST) allows the owner to cancel a pending order once and restores stock', async () => {
    const ownerEmail = `e2e-cancel-owner-${randomUUID()}@example.com`;
    const otherUserEmail = `e2e-cancel-other-${randomUUID()}@example.com`;
    const password = 'secure-password-123';
    const categorySlug = `e2e-cancel-category-${randomUUID()}`;
    const productSlug = `e2e-cancel-product-${randomUUID()}`;
    const prisma = app.get(PrismaService);

    try {
      const category = await prisma.category.create({
        data: {
          name: `E2E Cancel Category ${randomUUID()}`,
          slug: categorySlug,
        },
      });

      const product = await prisma.product.create({
        data: {
          name: 'E2E Cancel Product',
          slug: productSlug,
          description: 'Product used by the cancel order e2e test.',
          price: '39.99',
          stock: 5,
          categoryId: category.id,
        },
      });

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: ownerEmail, password })
        .expect(201);

      const ownerLoginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: ownerEmail, password })
        .expect(200);

      if (!hasAccessToken(ownerLoginResponse.body)) {
        throw new Error('Expected a cancel order owner access token');
      }

      const ownerAuthorization = `Bearer ${ownerLoginResponse.body.accessToken}`;

      await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', ownerAuthorization)
        .send({ productId: product.id, quantity: 2 })
        .expect(201);

      const checkoutResponse = await request(app.getHttpServer())
        .post('/orders/checkout')
        .set('Authorization', ownerAuthorization)
        .set('Idempotency-Key', randomUUID())
        .expect(201);

      if (!hasId(checkoutResponse.body)) {
        throw new Error('Expected an order to cancel');
      }

      const orderId = checkoutResponse.body.id;

      await request(app.getHttpServer())
        .post(`/orders/${orderId}/cancel`)
        .expect(401);

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: otherUserEmail, password })
        .expect(201);

      const otherUserLoginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: otherUserEmail, password })
        .expect(200);

      if (!hasAccessToken(otherUserLoginResponse.body)) {
        throw new Error('Expected another cancel order access token');
      }

      await request(app.getHttpServer())
        .post(`/orders/${orderId}/cancel`)
        .set(
          'Authorization',
          `Bearer ${otherUserLoginResponse.body.accessToken}`,
        )
        .expect(404);

      const cancelResponse = await request(app.getHttpServer())
        .post(`/orders/${orderId}/cancel`)
        .set('Authorization', ownerAuthorization)
        .expect(200);

      expect(cancelResponse.body).toMatchObject({
        id: orderId,
        status: 'CANCELED',
      });

      const productAfterCancel = await prisma.product.findUniqueOrThrow({
        where: { id: product.id },
        select: { stock: true },
      });
      expect(productAfterCancel.stock).toBe(5);

      const cancelMovement = await prisma.inventoryMovement.findFirstOrThrow({
        where: {
          productId: product.id,
          orderId,
          type: InventoryMovementType.ORDER_CANCELED,
        },
        select: {
          quantity: true,
          stockBefore: true,
          stockAfter: true,
        },
      });

      expect(cancelMovement).toEqual({
        quantity: 2,
        stockBefore: 3,
        stockAfter: 5,
      });

      await request(app.getHttpServer())
        .post(`/orders/${orderId}/cancel`)
        .set('Authorization', ownerAuthorization)
        .expect(400);

      const productAfterRepeatedCancel = await prisma.product.findUniqueOrThrow(
        {
          where: { id: product.id },
          select: { stock: true },
        },
      );
      expect(productAfterRepeatedCancel.stock).toBe(5);
    } finally {
      await prisma.order.deleteMany({ where: { user: { email: ownerEmail } } });
      await prisma.user.deleteMany({
        where: { email: { in: [ownerEmail, otherUserEmail] } },
      });
      await prisma.inventoryMovement.deleteMany({
        where: { product: { slug: productSlug } },
      });
      await prisma.product.deleteMany({ where: { slug: productSlug } });
      await prisma.category.deleteMany({ where: { slug: categorySlug } });
    }
  });

  it('/orders/:id/status (PATCH) allows only admins to make valid status transitions', async () => {
    const adminEmail = `e2e-order-admin-${randomUUID()}@example.com`;
    const customerEmail = `e2e-order-customer-${randomUUID()}@example.com`;
    const password = 'secure-password-123';
    const prisma = app.get(PrismaService);

    try {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: adminEmail, password })
        .expect(201);

      const admin = await prisma.user.update({
        where: { email: adminEmail },
        data: { role: Role.ADMIN },
        select: { id: true },
      });

      const order = await prisma.order.create({
        data: {
          userId: admin.id,
          subtotal: '10.00',
          totalAmount: '10.00',
        },
        select: { id: true },
      });

      const adminLoginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: adminEmail, password })
        .expect(200);

      if (!hasAccessToken(adminLoginResponse.body)) {
        throw new Error('Expected an admin access token');
      }

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: customerEmail, password })
        .expect(201);

      const customerLoginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: customerEmail, password })
        .expect(200);

      if (!hasAccessToken(customerLoginResponse.body)) {
        throw new Error('Expected a customer access token');
      }

      await request(app.getHttpServer())
        .get('/orders/admin')
        .set(
          'Authorization',
          `Bearer ${customerLoginResponse.body.accessToken}`,
        )
        .expect(403);

      const adminOrdersResponse = await request(app.getHttpServer())
        .get('/orders/admin')
        .set('Authorization', `Bearer ${adminLoginResponse.body.accessToken}`)
        .expect(200);

      expect(adminOrdersResponse.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: order.id,
            status: 'PENDING',
            user: {
              id: admin.id,
              email: adminEmail,
            },
          }),
        ]),
      );

      await request(app.getHttpServer())
        .patch(`/orders/${order.id}/status`)
        .set(
          'Authorization',
          `Bearer ${customerLoginResponse.body.accessToken}`,
        )
        .send({ status: 'PROCESSING' })
        .expect(403);

      const statusUpdateResponse = await request(app.getHttpServer())
        .patch(`/orders/${order.id}/status`)
        .set('Authorization', `Bearer ${adminLoginResponse.body.accessToken}`)
        .send({ status: 'PROCESSING' })
        .expect(200);

      expect(statusUpdateResponse.body).toMatchObject({
        id: order.id,
        status: 'PROCESSING',
      });

      await request(app.getHttpServer())
        .patch(`/orders/${order.id}/status`)
        .set('Authorization', `Bearer ${adminLoginResponse.body.accessToken}`)
        .send({ status: 'PENDING' })
        .expect(400);

      await request(app.getHttpServer())
        .patch(`/orders/${order.id}/status`)
        .set('Authorization', `Bearer ${adminLoginResponse.body.accessToken}`)
        .send({ status: 'PAID' })
        .expect(400);
    } finally {
      await prisma.order.deleteMany({ where: { user: { email: adminEmail } } });
      await prisma.user.deleteMany({
        where: { email: { in: [adminEmail, customerEmail] } },
      });
    }
  });

  it('/payments supports owner-only payment creation and mock webhook lifecycle', async () => {
    const ownerEmail = `e2e-payment-owner-${randomUUID()}@example.com`;
    const otherUserEmail = `e2e-payment-other-${randomUUID()}@example.com`;
    const password = 'secure-password-123';
    const categorySlug = `e2e-payment-category-${randomUUID()}`;
    const productSlug = `e2e-payment-product-${randomUUID()}`;
    const prisma = app.get(PrismaService);

    try {
      const category = await prisma.category.create({
        data: {
          name: `E2E Payment Category ${randomUUID()}`,
          slug: categorySlug,
        },
      });

      const product = await prisma.product.create({
        data: {
          name: 'E2E Payment Product',
          slug: productSlug,
          description: 'Product used by the payment e2e test.',
          price: '59.99',
          stock: 5,
          categoryId: category.id,
        },
      });

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: ownerEmail, password })
        .expect(201);

      const ownerLoginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: ownerEmail, password })
        .expect(200);

      if (!hasAccessToken(ownerLoginResponse.body)) {
        throw new Error('Expected a payment owner access token');
      }

      const ownerAuthorization = `Bearer ${ownerLoginResponse.body.accessToken}`;

      await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', ownerAuthorization)
        .send({ productId: product.id, quantity: 1 })
        .expect(201);

      const checkoutResponse = await request(app.getHttpServer())
        .post('/orders/checkout')
        .set('Authorization', ownerAuthorization)
        .set('Idempotency-Key', randomUUID())
        .expect(201);

      if (!hasId(checkoutResponse.body)) {
        throw new Error('Expected an order for the payment test');
      }

      const orderId = checkoutResponse.body.id;

      await request(app.getHttpServer())
        .post(`/payments/orders/${orderId}`)
        .expect(401);

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: otherUserEmail, password })
        .expect(201);

      const otherUserLoginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: otherUserEmail, password })
        .expect(200);

      if (!hasAccessToken(otherUserLoginResponse.body)) {
        throw new Error('Expected another payment user access token');
      }

      await request(app.getHttpServer())
        .post(`/payments/orders/${orderId}`)
        .set(
          'Authorization',
          `Bearer ${otherUserLoginResponse.body.accessToken}`,
        )
        .expect(404);

      const createPaymentResponse = await request(app.getHttpServer())
        .post(`/payments/orders/${orderId}`)
        .set('Authorization', ownerAuthorization)
        .expect(201);

      if (!hasId(createPaymentResponse.body)) {
        throw new Error('Expected a created payment id');
      }

      const paymentId = createPaymentResponse.body.id;
      expect(createPaymentResponse.body).toMatchObject({
        orderId,
        amount: '59.99',
        status: 'PENDING',
        provider: 'mock',
      });

      const mockWebhookSecret = process.env['MOCK_PAYMENT_WEBHOOK_SECRET'];

      if (!mockWebhookSecret) {
        throw new Error(
          'Expected MOCK_PAYMENT_WEBHOOK_SECRET for webhook test',
        );
      }

      const otherUserAuthorization = `Bearer ${otherUserLoginResponse.body.accessToken}`;

      await request(app.getHttpServer())
        .post(`/payments/${paymentId}/confirm`)
        .set('Authorization', otherUserAuthorization)
        .expect(404);

      await request(app.getHttpServer())
        .post(`/payments/${paymentId}/fail`)
        .set('Authorization', otherUserAuthorization)
        .expect(404);

      await request(app.getHttpServer())
        .post('/payments/webhooks/mock')
        .send({ paymentId, status: 'SUCCEEDED' })
        .expect(401);

      await request(app.getHttpServer())
        .post('/payments/webhooks/mock')
        .set('x-mock-webhook-secret', 'invalid-secret')
        .send({ paymentId, status: 'SUCCEEDED' })
        .expect(401);

      await request(app.getHttpServer())
        .post('/payments/webhooks/mock')
        .set('x-mock-webhook-secret', mockWebhookSecret)
        .send({ paymentId, status: 'PENDING' })
        .expect(400);

      await request(app.getHttpServer())
        .post('/payments/webhooks/mock')
        .set('x-mock-webhook-secret', mockWebhookSecret)
        .send({ paymentId: randomUUID(), status: 'SUCCEEDED' })
        .expect(404);

      const repeatedCreateResponse = await request(app.getHttpServer())
        .post(`/payments/orders/${orderId}`)
        .set('Authorization', ownerAuthorization)
        .expect(201);

      expect(repeatedCreateResponse.body).toMatchObject({
        id: paymentId,
        status: 'PENDING',
      });

      const failResponse = await request(app.getHttpServer())
        .post('/payments/webhooks/mock')
        .set('x-mock-webhook-secret', mockWebhookSecret)
        .send({ paymentId, status: 'FAILED' })
        .expect(200);

      expect(failResponse.body).toMatchObject({
        id: paymentId,
        status: 'FAILED',
      });

      const orderAfterFailure = await prisma.order.findUniqueOrThrow({
        where: { id: orderId },
        select: { status: true },
      });
      expect(orderAfterFailure.status).toBe('PENDING');

      const repeatedFailResponse = await request(app.getHttpServer())
        .post('/payments/webhooks/mock')
        .set('x-mock-webhook-secret', mockWebhookSecret)
        .send({ paymentId, status: 'FAILED' })
        .expect(200);

      expect(repeatedFailResponse.body).toMatchObject({
        id: paymentId,
        status: 'FAILED',
      });
      expect(repeatedFailResponse.body).toEqual(failResponse.body);

      const retryResponse = await request(app.getHttpServer())
        .post(`/payments/orders/${orderId}`)
        .set('Authorization', ownerAuthorization)
        .expect(201);

      expect(retryResponse.body).toMatchObject({
        id: paymentId,
        status: 'PENDING',
      });

      const confirmResponse = await request(app.getHttpServer())
        .post('/payments/webhooks/mock')
        .set('x-mock-webhook-secret', mockWebhookSecret)
        .send({ paymentId, status: 'SUCCEEDED' })
        .expect(200);

      expect(confirmResponse.body).toMatchObject({
        id: paymentId,
        status: 'SUCCEEDED',
      });

      const repeatedConfirmResponse = await request(app.getHttpServer())
        .post('/payments/webhooks/mock')
        .set('x-mock-webhook-secret', mockWebhookSecret)
        .send({ paymentId, status: 'SUCCEEDED' })
        .expect(200);

      expect(repeatedConfirmResponse.body).toMatchObject({
        id: paymentId,
        status: 'SUCCEEDED',
      });
      expect(repeatedConfirmResponse.body).toEqual(confirmResponse.body);

      const order = await prisma.order.findUniqueOrThrow({
        where: { id: orderId },
        select: { status: true },
      });
      expect(order.status).toBe('PROCESSING');

      await request(app.getHttpServer())
        .post('/payments/webhooks/mock')
        .set('x-mock-webhook-secret', mockWebhookSecret)
        .send({ paymentId, status: 'FAILED' })
        .expect(400);
    } finally {
      await prisma.payment.deleteMany({
        where: { order: { user: { email: ownerEmail } } },
      });
      await prisma.order.deleteMany({ where: { user: { email: ownerEmail } } });
      await prisma.user.deleteMany({
        where: { email: { in: [ownerEmail, otherUserEmail] } },
      });
      await prisma.inventoryMovement.deleteMany({
        where: { product: { slug: productSlug } },
      });
      await prisma.product.deleteMany({ where: { slug: productSlug } });
      await prisma.category.deleteMany({ where: { slug: categorySlug } });
    }
  });

  it('/inventory/products/:productId/restock (POST) allows admins to restock and records the actor', async () => {
    const adminEmail = `e2e-inventory-admin-${randomUUID()}@example.com`;
    const customerEmail = `e2e-inventory-customer-${randomUUID()}@example.com`;
    const password = 'secure-password-123';
    const categorySlug = `e2e-inventory-category-${randomUUID()}`;
    const productSlug = `e2e-inventory-product-${randomUUID()}`;
    const prisma = app.get(PrismaService);

    try {
      const category = await prisma.category.create({
        data: {
          name: `E2E Inventory Category ${randomUUID()}`,
          slug: categorySlug,
        },
      });

      const product = await prisma.product.create({
        data: {
          name: 'E2E Inventory Product',
          slug: productSlug,
          description: 'Product used by the inventory e2e test.',
          price: '19.99',
          stock: 5,
          categoryId: category.id,
        },
      });

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: adminEmail, password })
        .expect(201);

      await prisma.user.update({
        where: { email: adminEmail },
        data: { role: Role.ADMIN },
      });

      const adminLoginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: adminEmail, password })
        .expect(200);

      if (!hasAccessToken(adminLoginResponse.body)) {
        throw new Error('Expected an inventory admin access token');
      }

      const adminAuthorization = `Bearer ${adminLoginResponse.body.accessToken}`;

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: customerEmail, password })
        .expect(201);

      const customerLoginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: customerEmail, password })
        .expect(200);

      if (!hasAccessToken(customerLoginResponse.body)) {
        throw new Error('Expected an inventory customer access token');
      }

      await request(app.getHttpServer())
        .post(`/inventory/products/${product.id}/restock`)
        .send({ quantity: 3 })
        .expect(401);

      await request(app.getHttpServer())
        .post(`/inventory/products/${product.id}/restock`)
        .set(
          'Authorization',
          `Bearer ${customerLoginResponse.body.accessToken}`,
        )
        .send({ quantity: 3 })
        .expect(403);

      await request(app.getHttpServer())
        .post(`/inventory/products/${product.id}/restock`)
        .set('Authorization', adminAuthorization)
        .send({ quantity: 0 })
        .expect(400);

      await request(app.getHttpServer())
        .post(`/inventory/products/${randomUUID()}/restock`)
        .set('Authorization', adminAuthorization)
        .send({ quantity: 3 })
        .expect(404);

      const restockResponse = await request(app.getHttpServer())
        .post(`/inventory/products/${product.id}/restock`)
        .set('Authorization', adminAuthorization)
        .send({ quantity: 3 })
        .expect(201);

      expect(restockResponse.body).toMatchObject({
        product: {
          id: product.id,
          slug: product.slug,
          stock: 8,
        },
        movement: {
          type: InventoryMovementType.RESTOCK,
          quantity: 3,
          stockBefore: 5,
          stockAfter: 8,
        },
      });

      const admin = await prisma.user.findUniqueOrThrow({
        where: { email: adminEmail },
        select: { id: true },
      });
      const movement = await prisma.inventoryMovement.findFirstOrThrow({
        where: {
          productId: product.id,
          type: InventoryMovementType.RESTOCK,
        },
        select: {
          actorUserId: true,
          quantity: true,
          stockBefore: true,
          stockAfter: true,
        },
      });

      expect(movement).toEqual({
        actorUserId: admin.id,
        quantity: 3,
        stockBefore: 5,
        stockAfter: 8,
      });
    } finally {
      await prisma.inventoryMovement.deleteMany({
        where: { product: { slug: productSlug } },
      });
      await prisma.product.deleteMany({ where: { slug: productSlug } });
      await prisma.category.deleteMany({ where: { slug: categorySlug } });
      await prisma.user.deleteMany({
        where: { email: { in: [adminEmail, customerEmail] } },
      });
    }
  });

  afterEach(async () => {
    await app.close();
  });
});
