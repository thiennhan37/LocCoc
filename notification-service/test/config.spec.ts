import { describe, it, expect } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { validateNotificationEnvironment } from '@loccoc/common';
const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const env = {
  NODE_ENV: 'test',
  DB_HOST: 'localhost',
  NOTIFICATION_DB_USER: 'notification_service',
  NOTIFICATION_DB_PASSWORD: 'test-only',
  NOTIFICATION_CURSOR_SECRET: 'test-cursor-secret-12345678901234567890',
  JWT_PUBLIC_KEY: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
};
describe('notification-local configuration', () => {
  it('needs no IAM database credentials or Redis and parses its own port', () => {
    const c = validateNotificationEnvironment({
      ...env,
      NOTIFICATION_PORT: '8182',
    });
    expect(c.NOTIFICATION_PORT).toBe(8182);
    expect(c.NOTIFICATION_DB_NAME).toBe('notifications');
    expect(c.FCM_ENABLED).toBe('false');
  });
  it.each([
    { NOTIFICATION_PORT: 'wrong' },
    { NOTIFICATION_CURSOR_SECRET: 'short' },
    { FCM_ENABLED: 'sometimes' },
  ])('rejects invalid configuration %j', (overrides) => {
    expect(() =>
      validateNotificationEnvironment({ ...env, ...overrides }),
    ).toThrow();
  });
});
