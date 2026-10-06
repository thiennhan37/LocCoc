import { describe, expect, it } from 'vitest';
import { PasswordService } from './password.service.js';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('hashes passwords with Argon2id and verifies the hash', async () => {
    const password = 'a-strong-password-123';
    const hash = await service.hash(password);

    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(service.verify(hash, password)).resolves.toBe(true);
    await expect(service.verify(hash, 'a-different-password')).resolves.toBe(false);
  });

  it('rejects weak, common, and email-derived passwords', () => {
    expect(service.validatePolicy('short', 'person@example.com')).toEqual(
      expect.arrayContaining(['password must be at least 10 characters']),
    );
    expect(service.validatePolicy('password', 'person@example.com')).toEqual(
      expect.arrayContaining(['password is too common']),
    );
    expect(service.validatePolicy('person', 'person@example.com')).toEqual(
      expect.arrayContaining(['password must not match email']),
    );
    expect(service.validatePolicy('person@example.com', 'person@example.com')).toEqual(
      expect.arrayContaining(['password must not match email']),
    );
  });

  it('accepts a long, non-common password within the configured bounds', () => {
    expect(service.validatePolicy('correct horse battery staple 2026', 'person@example.com')).toEqual([]);
    expect(service.validatePolicy('x'.repeat(129), 'person@example.com')).toEqual(
      expect.arrayContaining(['password must be at most 128 characters']),
    );
  });

  it('performs dummy hashing when no stored hash is available', async () => {
    await expect(service.verify(undefined, 'some-password')).resolves.toBe(false);
  });
});
