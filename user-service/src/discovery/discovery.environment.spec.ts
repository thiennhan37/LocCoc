import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { validateUserEnvironment } from '@loccoc/common';
const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const base = {
  NODE_ENV: 'test',
  DB_HOST: 'localhost',
  USER_DB_USER: 'test',
  USER_DB_PASSWORD: 'test',
  REDIS_URL: 'redis://localhost:6379',
  JWT_PUBLIC_KEY: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
};
describe('discovery environment validation', () => {
  it('permits test environments without live graph credentials', () => {
    expect(validateUserEnvironment(base)).toMatchObject({
      DISCOVERY_ENABLED: 'true',
      DISCOVERY_CACHE_TTL_SECONDS: 600,
      DISCOVERY_MAX_LAG_SECONDS: 30,
    });
  });
  it('requires graph URL/password when enabled outside tests, without leaking supplied values', () => {
    const configured = {
      ...base,
      NODE_ENV: 'development',
      INTERNAL_SERVICE_TOKEN: 'isolated-test-token-with-32-characters',
    };
    expect(() => validateUserEnvironment(configured)).toThrow(
      'NEO4J_HTTP_URL, NEO4J_PASSWORD required',
    );
    expect(() =>
      validateUserEnvironment({
        ...configured,
        NEO4J_HTTP_URL: 'http://localhost:7474',
      }),
    ).toThrow('NEO4J_PASSWORD required');
    expect(
      validateUserEnvironment({ ...configured, DISCOVERY_ENABLED: 'false' })
        .DISCOVERY_ENABLED,
    ).toBe('false');
  });
  it.each([
    { DISCOVERY_ENABLED: 'yes' },
    { DISCOVERY_CACHE_TTL_SECONDS: 0 },
    { DISCOVERY_CACHE_TTL_SECONDS: 3601 },
    { DISCOVERY_MAX_LAG_SECONDS: -1 },
    { NEO4J_HTTP_URL: 'file:///private' },
    { SOCIAL_GRAPH_EVENTS_TOPIC: 'bad topic' },
    { GRAPH_CONSUMER_GROUP: 'bad group' },
  ])('rejects invalid typed configuration %j', (patch) => {
    expect(() => validateUserEnvironment({ ...base, ...patch })).toThrow(
      'Invalid environment',
    );
  });
});
