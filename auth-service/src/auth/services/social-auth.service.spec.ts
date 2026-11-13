import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Redis } from 'ioredis';
import { describe, expect, it, vi } from 'vitest';
import type { AuthService } from '../auth.service.js';
import type { IdentitiesRepository } from '../identities.repository.js';
import { SocialAuthService } from './social-auth.service.js';
import type { SocialTokenVerifier, VerifiedSocialIdentity } from './social-token-verifier.service.js';

function harness() {
  const claims: VerifiedSocialIdentity = {
    provider: 'google', providerUserId: 'sub', email: 'user@example.com', emailVerified: true,
    name: null, isPrivateEmail: false, expiresAt: Math.floor(Date.now() / 1000) + 600,
  };
  const verifier = { verify: vi.fn(async () => claims) };
  const identities = { withAccount: vi.fn(async () => ({ accessToken: 'local-access', refreshToken: 'local-refresh' })) };
  const redis = { set: vi.fn(async (_key: string, _value: string, _expiryMode: 'EX', _ttl: number, _condition: 'NX') => 'OK' as string | null) };
  const service = new SocialAuthService(verifier as unknown as SocialTokenVerifier,
    identities as unknown as IdentitiesRepository, {} as AuthService, redis as unknown as Redis);
  return { service, claims, verifier, identities, redis };
}

describe('social sign-in orchestration', () => {
  it('verifies first, atomically consumes only a token digest, then resolves identity', async () => {
    const { service, verifier, redis, identities } = harness();
    await expect(service.login('google', { idToken: 'header.payload.signature', nonce: 'expected' })).resolves.toHaveProperty('accessToken');
    expect(verifier.verify).toHaveBeenCalledWith('google', 'header.payload.signature', 'expected');
    const digest = createHash('sha256').update('header.payload').digest('hex');
    expect(redis.set).toHaveBeenCalledWith(`auth:social:used:google:${digest}`, '1', 'EX', expect.any(Number), 'NX');
    expect(JSON.stringify(redis.set.mock.calls)).not.toContain('header.payload');
    expect(identities.withAccount).toHaveBeenCalledOnce();
  });

  it('does not access Redis or account storage for an invalid token', async () => {
    const { service, verifier, redis, identities } = harness();
    verifier.verify.mockRejectedValueOnce(new UnauthorizedException('Invalid social ID token'));
    await expect(service.login('google', { idToken: 'bad' })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(redis.set).not.toHaveBeenCalled();
    expect(identities.withAccount).not.toHaveBeenCalled();
  });

  it('rejects a replay without creating an identity or session', async () => {
    const { service, redis, identities } = harness();
    redis.set.mockResolvedValueOnce(null);
    await expect(service.login('apple', { idToken: 'used' })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(identities.withAccount).not.toHaveBeenCalled();
  });

  it('allows only one concurrent attempt, including alternate encodings of the same signed input', async () => {
    const { service, redis, identities } = harness();
    const consumed = new Set<string>();
    redis.set.mockImplementation(async (key: string) => {
      if (consumed.has(key)) return null;
      consumed.add(key);
      return 'OK';
    });
    const attempts = await Promise.allSettled([
      service.login('google', { idToken: 'header.payload.signature-one' }),
      service.login('google', { idToken: 'header.payload.signature-two' }),
    ]);
    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(1);
    expect(identities.withAccount).toHaveBeenCalledOnce();
  });

  it('fails closed if Redis is unavailable', async () => {
    const { service, redis, identities } = harness();
    redis.set.mockRejectedValueOnce(new Error('Redis unavailable'));
    await expect(service.login('google', { idToken: 'signed' })).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(identities.withAccount).not.toHaveBeenCalled();
  });

  it('rejects a token that expires between signature verification and consumption', async () => {
    const { service, claims, redis } = harness();
    claims.expiresAt = Math.floor(Date.now() / 1000);
    await expect(service.login('google', { idToken: 'expired' })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(redis.set).not.toHaveBeenCalled();
  });
});
