import { createPrivateKey, createPublicKey } from 'node:crypto';
import { readFileSync } from 'node:fs';
import Joi from 'joi';

const schema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  GATEWAY_PORT: Joi.number().port().default(8080),
  AUTH_PORT: Joi.number().port().default(8000),
  USER_PORT: Joi.number().port().default(8081),
  AUTH_SERVICE_URL: Joi.string().uri({ scheme: ['http', 'https'] }).default('http://127.0.0.1:8000'),
  USER_SERVICE_URL: Joi.string().uri({ scheme: ['http', 'https'] }).default('http://127.0.0.1:8081'),
  DB_HOST: Joi.string().hostname().required(),
  DB_PORT: Joi.number().port().default(5433),
  AUTH_DB_NAME: Joi.string().required(),
  AUTH_DB_USER: Joi.string().required(),
  AUTH_DB_PASSWORD: Joi.string().required(),
  USER_DB_NAME: Joi.string().required(),
  USER_DB_USER: Joi.string().required(),
  USER_DB_PASSWORD: Joi.string().required(),
  REDIS_URL: Joi.string().uri({ scheme: ['redis', 'rediss'] }).required(),
  // Password hashing (OWASP Argon2id baseline: 19 MiB, t=2, p=1).
  ARGON2_MEMORY_COST: Joi.number().integer().min(8192).default(19456),
  ARGON2_TIME_COST: Joi.number().integer().min(1).default(2),
  ARGON2_PARALLELISM: Joi.number().integer().min(1).default(1),
  ARGON2_HASH_LENGTH: Joi.number().integer().min(16).max(128).default(32),
  ARGON2_SALT_LENGTH: Joi.number().integer().min(8).max(64).default(16),
  // Backward-compatible service-prefixed aliases consumed by auth-service.
  AUTH_ARGON2_MEMORY_COST: Joi.number().integer().min(8192).default(19456),
  AUTH_ARGON2_TIME_COST: Joi.number().integer().min(1).default(2),
  AUTH_ARGON2_PARALLELISM: Joi.number().integer().min(1).default(1),
  AUTH_ARGON2_HASH_LENGTH: Joi.number().integer().min(16).max(128).default(32),
  COMMON_PASSWORDS: Joi.string().allow('').default(''),
  COMMON_PASSWORDS_PATH: Joi.string().allow('').default(''),
  LOGIN_MAX_ATTEMPTS: Joi.number().integer().positive().default(5),
  LOGIN_LOCK_BASE_SECONDS: Joi.number().integer().positive().default(1),
  LOGIN_LOCK_MAX_SECONDS: Joi.number().integer().positive().default(900),
  TYPEORM_LOGGING: Joi.boolean().truthy('true').falsy('false').default(false),
  TYPEORM_MIGRATIONS_RUN: Joi.boolean().truthy('true').falsy('false').default(false),
  JWT_PRIVATE_KEY_PATH: Joi.string().allow('').default(''),
  JWT_PUBLIC_KEY_PATH: Joi.string().allow('').default(''),
  JWT_PRIVATE_KEY: Joi.string().allow('').default(''),
  JWT_PUBLIC_KEY: Joi.string().allow('').default(''),
  JWT_ACCESS_TTL_SECONDS: Joi.number().integer().positive().default(900),
  JWT_REFRESH_TTL_SECONDS: Joi.number().integer().positive().default(604800),
  CORS_ORIGINS: Joi.string().required(),
  RATE_LIMIT_TTL_MS: Joi.number().integer().positive().default(60000),
  RATE_LIMIT_MAX: Joi.number().integer().positive().default(100),
}).unknown(true);

export function validateEnvironment(input: Record<string, unknown>): Record<string, unknown> {
  // Validate environment variables
  // abortEarly: false => validate all environment variables, return all errors
  const { error, value } = schema.validate(input, { abortEarly: false });
  if (error) throw new Error(`Invalid environment: ${error.details.map((item) => item.path.join('.')).join(', ')}`);

  const env = value as Record<string, string | number>;
  // CORS_ORIGINS: must contain explicit HTTP(S) origins, not contain '*' or empty string
  const origins = String(env.CORS_ORIGINS).split(',').map((origin) => origin.trim());
  if (origins.some((origin) => !origin || origin === '*' || !/^https?:\/\/[^/]+$/.test(origin))) {
    throw new Error('Invalid environment: CORS_ORIGINS must contain explicit HTTP(S) origins');
  }

  const privatePem = loadKey(env, 'JWT_PRIVATE_KEY');
  const publicPem = loadKey(env, 'JWT_PUBLIC_KEY');
  // Validate JWT key pair
  try {
    const privateKey = createPrivateKey(privatePem);
    const publicKey = createPublicKey(publicPem);
    if (!['rsa', 'ec'].includes(privateKey.asymmetricKeyType ?? '') ||
        !privateKey.asymmetricKeyType || privateKey.asymmetricKeyType !== publicKey.asymmetricKeyType) {
      throw new Error('key types differ');
    }
    const derived = createPublicKey(privateKey).export({ type: 'spki', format: 'pem' });
    const supplied = publicKey.export({ type: 'spki', format: 'pem' });
    if (derived !== supplied) throw new Error('public key does not match private key');
  } catch {
    throw new Error('Invalid environment: JWT key pair is invalid or mismatched');
  }
  env.JWT_PRIVATE_KEY = privatePem;
  env.JWT_PUBLIC_KEY = publicPem;
  return env;
}

function loadKey(env: Record<string, string | number>, name: 'JWT_PRIVATE_KEY' | 'JWT_PUBLIC_KEY'): string {
  const inline = String(env[name] ?? '').replace(/\\n/g, '\n');
  const path = String(env[`${name}_PATH`] ?? '');
  // Set exactly one of JWT_PRIVATE_KEY and JWT_PRIVATE_KEY_PATH, same for public key
  if (Boolean(inline) === Boolean(path)) {
    throw new Error(`Invalid environment: set exactly one of ${name} and ${name}_PATH`);
  }
  try { return inline || readFileSync(path, 'utf8'); }
  catch { throw new Error(`Invalid environment: cannot read ${name}_PATH`); }
}

