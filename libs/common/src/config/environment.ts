import { createPrivateKey, createPublicKey } from 'node:crypto';
import { readFileSync } from 'node:fs';
import Joi from 'joi';

const schema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  GATEWAY_PORT: Joi.number().port().default(8080),
  AUTH_PORT: Joi.number().port().default(8000),
  USER_PORT: Joi.number().port().default(8081),
  DB_HOST: Joi.string().hostname().required(),
  DB_PORT: Joi.number().port().default(5433),
  AUTH_DB_NAME: Joi.string().required(),
  AUTH_DB_USER: Joi.string().required(),
  AUTH_DB_PASSWORD: Joi.string().required(),
  USER_DB_NAME: Joi.string().required(),
  USER_DB_USER: Joi.string().required(),
  USER_DB_PASSWORD: Joi.string().required(),
  REDIS_URL: Joi.string().uri({ scheme: ['redis', 'rediss'] }).required(),
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
  const { error, value } = schema.validate(input, { abortEarly: false });
  if (error) throw new Error(`Invalid environment: ${error.details.map((item) => item.path.join('.')).join(', ')}`);

  const env = value as Record<string, string | number>;
  const origins = String(env.CORS_ORIGINS).split(',').map((origin) => origin.trim());
  if (origins.some((origin) => !origin || origin === '*' || !/^https?:\/\/[^/]+$/.test(origin))) {
    throw new Error('Invalid environment: CORS_ORIGINS must contain explicit HTTP(S) origins');
  }

  const privatePem = loadKey(env, 'JWT_PRIVATE_KEY');
  const publicPem = loadKey(env, 'JWT_PUBLIC_KEY');
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
  if (Boolean(inline) === Boolean(path)) {
    throw new Error(`Invalid environment: set exactly one of ${name} and ${name}_PATH`);
  }
  try { return inline || readFileSync(path, 'utf8'); }
  catch { throw new Error(`Invalid environment: cannot read ${name}_PATH`); }
}
