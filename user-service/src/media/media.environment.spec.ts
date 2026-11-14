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
  JWT_PUBLIC_KEY: publicKey.export({ format: 'pem', type: 'spki' }).toString(),
};
const media = {
  MEDIA_ENABLED: 'true',
  MEDIA_S3_ENDPOINT: 'https://s3.example.test',
  MEDIA_S3_BUCKET: 'loccoc-media',
  MEDIA_S3_ACCESS_KEY: 'test-access',
  MEDIA_S3_SECRET_KEY: 'private-test-value',
  MEDIA_PUBLIC_BASE_URL: 'https://media.example.test/loccoc-media',
};
describe('media environment validation', () => {
  it('leaves media disabled until explicitly configured', () => {
    expect(validateUserEnvironment(base).MEDIA_ENABLED).toBe('false');
    expect(() =>
      validateUserEnvironment({ ...base, MEDIA_ENABLED: 'true' }),
    ).toThrow('required for media uploads');
    expect(validateUserEnvironment({ ...base, ...media }).MEDIA_ENABLED).toBe(
      'true',
    );
  });
  it.each([
    { MEDIA_ENABLED: 'yes' },
    { MEDIA_S3_ENDPOINT: 'file:///tmp' },
    { MEDIA_S3_ENDPOINT: 'https://user:secret@s3.example.test' },
    { MEDIA_PUBLIC_BASE_URL: 'https://media.example.test/a?secret=private' },
    { MEDIA_ALLOWED_ORIGINS: 'http://unsafe.test' },
    { MEDIA_ALLOWED_ORIGINS: 'https://images.test/path' },
  ])('rejects unsafe config without echoing values', (patch) => {
    expect(() =>
      validateUserEnvironment({ ...base, ...media, ...patch }),
    ).toThrow('Invalid environment');
    try {
      validateUserEnvironment({ ...base, ...media, ...patch });
    } catch (error) {
      expect(String(error)).not.toContain('private-test-value');
    }
  });
  it('requires TLS in production and accepts an explicit HTTPS compatibility list', () => {
    expect(() =>
      validateUserEnvironment({
        ...base,
        ...media,
        NODE_ENV: 'production',
        MEDIA_S3_ENDPOINT: 'http://s3.example.test',
      }),
    ).toThrow('safe media URL');
    expect(
      validateUserEnvironment({
        ...base,
        ...media,
        MEDIA_ALLOWED_ORIGINS: 'https://images.test,https://legacy.test',
      }).MEDIA_ALLOWED_ORIGINS,
    ).toBe('https://images.test,https://legacy.test');
  });
});
