import { ConfigService } from '@nestjs/config';
import { fileURLToPath } from 'node:url';
import type { DataSourceOptions } from 'typeorm';
import { CreateChat1794528000000 } from './database/migrations/1794528000000-CreateChat.js';

export const chatEnvPath = fileURLToPath(new URL('../.env', import.meta.url));

export function validateChatEnvironment(input: Record<string, unknown>): Record<string, unknown> {
  const env: Record<string, unknown> = { ...input };
  const text = (name: string, fallback?: string) => {
    const value = input[name] ?? fallback;
    if (typeof value !== 'string' || !value.trim()) throw new Error(`Invalid chat environment: ${name}`);
    env[name] = value.trim(); return value.trim();
  };
  const integer = (name: string, fallback: number, max = 65535) => {
    const value = Number(input[name] ?? fallback);
    if (!Number.isInteger(value) || value < 1 || value > max) throw new Error(`Invalid chat environment: ${name}`);
    env[name] = value;
  };
  if (text('INTERNAL_SERVICE_TOKEN').length < 32) throw new Error('Invalid chat environment: INTERNAL_SERVICE_TOKEN');
  text('CHAT_DB_PASSWORD'); text('CHAT_DB_NAME', 'chat'); text('CHAT_DB_USER', 'chat_service');
  text('DB_HOST', '127.0.0.1'); text('SERVICE_BIND_HOST', '127.0.0.1');
  integer('DB_PORT', 5433); integer('CHAT_SERVICE_PORT', 8083);
  for (const [name, fallback] of [['AUTH_SERVICE_URL', 'http://127.0.0.1:8000'], ['USER_SERVICE_URL', 'http://127.0.0.1:8081']] as const) {
    let url: URL; try { url = new URL(text(name, fallback)); } catch { throw new Error(`Invalid chat environment: ${name}`); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error(`Invalid chat environment: ${name}`);
  }
  text('CORS_ORIGINS', 'http://localhost:3000,http://localhost:5173');
  for (const origin of String(env.CORS_ORIGINS).split(',')) {
    let url: URL; try { url = new URL(origin.trim()); } catch { throw new Error('Invalid chat environment: CORS_ORIGINS'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin.trim()) throw new Error('Invalid chat environment: CORS_ORIGINS');
  }
  const run = input.TYPEORM_MIGRATIONS_RUN ?? false;
  if (![true, false, 'true', 'false'].includes(run as boolean | string)) throw new Error('Invalid chat environment: TYPEORM_MIGRATIONS_RUN');
  env.TYPEORM_MIGRATIONS_RUN = run === true || run === 'true';
  return env;
}

export function chatDatabaseOptions(config: ConfigService): DataSourceOptions {
  return {
    type: 'postgres', host: config.getOrThrow('DB_HOST'), port: config.getOrThrow('DB_PORT'),
    username: config.getOrThrow('CHAT_DB_USER'), password: config.getOrThrow('CHAT_DB_PASSWORD'),
    database: config.getOrThrow('CHAT_DB_NAME'), synchronize: false, logging: false,
    migrations: [CreateChat1794528000000], migrationsRun: config.get<boolean>('TYPEORM_MIGRATIONS_RUN', false),
  };
}
