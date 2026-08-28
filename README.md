# Nest Commerce API

Production-oriented e-commerce REST API built with NestJS, PostgreSQL, Prisma, Redis, BullMQ, Stripe, and Resend.

## Features

- JWT authentication with refresh-token rotation, logout, and password changes
- Role-based access control for `CUSTOMER` and `ADMIN`
- Public product catalog with filtering, sorting, pagination, and Redis cache
- Authenticated cart and transactional checkout with stock protection
- Order history, ownership checks, admin order management, and cancellation
- Stripe `PaymentIntent` integration with verified webhooks
- Idempotent checkout and payment-webhook processing
- BullMQ background jobs and email payment confirmations via Resend
- DTO validation, CORS, Helmet, rate limiting, request IDs, health checks, Swagger, and CI

## Stack

`Node.js` · `TypeScript` · `NestJS` · `PostgreSQL` · `Prisma` · `Redis` · `BullMQ` · `Stripe` · `Resend` · `Docker` · `Jest`

## Requirements

- Node.js 22+
- Docker Desktop
- Stripe test account and CLI for real payment-webhook testing (optional)
- Resend API key for email delivery (optional)

## Environment

Create your local environment file:

```powershell
Copy-Item .env.example .env
```

Fill every placeholder in `.env`. Do not commit this file: it contains local secrets and is ignored by Git.

For local development, the database and Redis URLs use host ports:

```text
DATABASE_URL=postgresql://...@localhost:5433/nest_commerce?schema=public
REDIS_URL=redis://localhost:6379
```

The production-like Docker setup overrides them internally to `postgres:5432` and `redis:6379`.

## Local development

Start PostgreSQL and Redis:

```powershell
docker compose up -d
docker compose ps
```

Install dependencies, apply local migrations, and start the API:

```powershell
npm install
npx prisma migrate dev
npx prisma generate
npm run start:dev
```

Useful local URLs:

```text
API:            http://localhost:3000
Swagger:        http://localhost:3000/docs
Health:         http://localhost:3000/health
Liveness:       http://localhost:3000/health/live
Prisma Studio:  npx prisma studio
```

Swagger is intentionally disabled when `NODE_ENV=production`.

## Production-like Docker run

The normal `docker-compose.yml` provides development infrastructure. The production override builds and runs the API as a container.

Apply migrations once for the current release:

```powershell
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile tools run --rm migrate
```

Build and start all services:

```powershell
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
curl.exe http://localhost:3000/health/live
```

Inspect API logs:

```powershell
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs api --tail 100
```

Stop the production-like stack without deleting volumes:

```powershell
docker compose -f docker-compose.yml -f docker-compose.prod.yml down
```

`Dockerfile` never copies `.env` into the image. Runtime secrets are injected through `env_file` locally; a real deployment should use a managed secret store.

## Stripe webhook testing

In a separate terminal:

```powershell
stripe listen --forward-to http://localhost:3000/payments/webhooks/stripe
```

Copy the displayed `whsec_...` value to `STRIPE_WEBHOOK_SECRET` in `.env`, restart the API, then create a Stripe PaymentIntent through the API. The webhook is the authoritative source for payment success or failure.

## Tests and quality checks

```powershell
npm run test
npm run test:e2e
npm run lint:check
npm run build
```

GitHub Actions runs dependency installation, Prisma generation, migrations, lint, build, and tests on every push.

## Core request flow

```text
request
→ request ID middleware
→ throttling / authentication / roles guards
→ DTO validation
→ controller
→ service
→ repository / Prisma
→ PostgreSQL or Redis
→ response
```

For payments:

```text
customer checkout
→ order + stock transaction
→ Stripe PaymentIntent
→ signed Stripe webhook
→ payment and order status transaction
→ BullMQ order-paid job
→ Resend confirmation email
```

## Security notes

- Passwords use `argon2` hashes; raw passwords and tokens are not persisted or logged.
- Identity comes from a verified access token, never from client-provided `userId`.
- Role checks and ownership checks are separate.
- Product price and order totals are calculated server-side.
- Checkout, stock changes, order creation, and cart cleanup use a transaction.
- Checkout and webhook processing are idempotent.
- Redis is used for cache, throttling, and queues; PostgreSQL remains authoritative.

## License

Private educational project.
