import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),

  PORT: Joi.number().port().default(3000),
  CORS_ORIGIN: Joi.string().uri().required(),

  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgresql'] })
    .required(),

  REDIS_URL: Joi.string()
    .uri({ scheme: ['redis'] })
    .required(),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_TOKEN_TTL: Joi.string()
    .pattern(/^\d+(ms|s|m|h|d)$/)
    .required(),

  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_TOKEN_TTL: Joi.string()
    .pattern(/^\d+(ms|s|m|h|d)$/)
    .required(),

  MOCK_PAYMENT_WEBHOOK_SECRET: Joi.string().min(16).required(),

  STRIPE_SECRET_KEY: Joi.string().min(20).required(),
  STRIPE_WEBHOOK_SECRET: Joi.string().min(20).required(),

  RESEND_API_KEY: Joi.string().pattern(/^re_/).required(),
  EMAIL_FROM: Joi.string().email().required(),

  ADMIN_EMAIL: Joi.string().email().optional(),
}).unknown(true);
