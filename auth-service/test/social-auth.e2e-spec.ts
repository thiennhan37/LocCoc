import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { JwtAuthGuard, JwtVerifier, RolesGuard } from '@loccoc/common';
import { generateKeyPairSync } from 'node:crypto';
import { createLocalJWKSet, SignJWT } from 'jose';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EntityManager } from 'typeorm';
import { REDIS_CLIENT } from '../src/database/redis.tokens.js';
import { AuthService } from '../src/auth/auth.service.js';
import { SocialAuthController } from '../src/auth/social-auth.controller.js';
import { IdentitiesRepository } from '../src/auth/identities.repository.js';
import { Account, AccountRole, AccountStatus } from '../src/auth/entities/account.entity.js';
import { SocialAuthService } from '../src/auth/services/social-auth.service.js';
import { SOCIAL_JWKS, SocialTokenVerifier, type VerifiedSocialIdentity } from '../src/auth/services/social-token-verifier.service.js';

const providerKey = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicJwks = createLocalJWKSet({ keys: [{ ...providerKey.publicKey.export({ format: 'jwk' }), kid: 'mock-provider', alg: 'RS256', use: 'sig' }] });
const config = {
  get: (key: string, fallback?: unknown) => ({ GOOGLE_CLIENT_IDS: 'google-mobile', APPLE_CLIENT_IDS: 'vn.loccoc.app' })[key as 'GOOGLE_CLIENT_IDS' | 'APPLE_CLIENT_IDS'] ?? fallback,
};

async function idToken(provider: 'google' | 'apple', suffix = '', changes: Record<string, unknown> = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    iss: provider === 'google' ? 'https://accounts.google.com' : 'https://appleid.apple.com',
    aud: provider === 'google' ? 'google-mobile' : 'vn.loccoc.app',
    sub: `subject-${suffix}`, email: 'signed@example.com', email_verified: true, iat: now, exp: now + 600, ...changes,
  }).setProtectedHeader({ alg: 'RS256', kid: 'mock-provider' }).sign(providerKey.privateKey);
}

describe('Social HTTP API (real verification, validation and guards)', () => {
  let app: INestApplication;
  const sessions = { createSocialSession: vi.fn(async () => ({ authenticated: true, accessToken: 'access', refreshToken: 'refresh', tokenType: 'Bearer' })) };
  const identities = { withAccount: vi.fn(async (
    _claims: VerifiedSocialIdentity,
    _name: string | undefined,
    callback: (manager: EntityManager, account: Account) => Promise<unknown>,
  ) => callback({} as EntityManager, Object.assign(new Account(), {
    id: 'local-user', email: 'signed@example.com', role: AccountRole.USER, status: AccountStatus.ACTIVE,
  }))) };
  const consumed = new Set<string>();
  const redis = {
    set: async (key: string) => { if (consumed.has(key)) return null; consumed.add(key); return 'OK'; },
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    consumed.clear();
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])],
      controllers: [SocialAuthController],
      providers: [
        SocialAuthService, SocialTokenVerifier, JwtVerifier, Reflector,
        { provide: ConfigService, useValue: config },
        { provide: SOCIAL_JWKS, useValue: { google: publicJwks, apple: publicJwks } },
        { provide: IdentitiesRepository, useValue: identities },
        { provide: AuthService, useValue: sessions },
        { provide: REDIS_CLIENT, useValue: redis },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useLogger(false);
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterEach(async () => { await app?.close(); });

  it.each(['google', 'apple'] as const)('allows public %s login and returns 200 with local token pair', async (provider) => {
    const response = await request(app.getHttpServer()).post(`/auth/social/${provider}`)
      .set('x-platform', 'ios').send({ idToken: await idToken(provider) }).expect(200);
    expect(response.body).toMatchObject({ authenticated: true, accessToken: 'access', refreshToken: 'refresh' });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(sessions.createSocialSession).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: 'local-user' }), expect.objectContaining({ platform: 'ios' }));
  });

  it.each(['email', 'userId', 'providerUserId', 'email_verified', 'role', 'status'])('rejects client-supplied %s instead of trusting it', async (field) => {
    await request(app.getHttpServer()).post('/auth/social/google')
      .send({ idToken: await idToken('google'), [field]: 'attacker' }).expect(400);
    expect(identities.withAccount).not.toHaveBeenCalled();
  });

  it('accepts Apple first-login name as metadata while taking email exclusively from the signed token', async () => {
    await request(app.getHttpServer()).post('/auth/social/apple')
      .send({ idToken: await idToken('apple'), name: 'Display Suggestion' }).expect(200);
    expect(identities.withAccount).toHaveBeenCalledWith(expect.objectContaining({ email: 'signed@example.com' }), 'Display Suggestion', expect.any(Function));
  });

  it('rejects malformed, missing, oversized and null input', async () => {
    for (const body of [{}, { idToken: null }, { idToken: 'bad' }, { idToken: `a.${'a'.repeat(16_384)}.a` }, { idToken: await idToken('google'), nonce: null }]) {
      await request(app.getHttpServer()).post('/auth/social/google').send(body).expect(400);
    }
    expect(identities.withAccount).not.toHaveBeenCalled();
  });

  it('returns 401 for wrong audience and nonce without issuing a session', async () => {
    await request(app.getHttpServer()).post('/auth/social/google')
      .send({ idToken: await idToken('google', '', { aud: 'other-app' }) }).expect(401);
    await request(app.getHttpServer()).post('/auth/social/apple')
      .send({ idToken: await idToken('apple', '', { nonce: 'original' }), nonce: 'wrong' }).expect(401);
    expect(sessions.createSocialSession).not.toHaveBeenCalled();
  });

  it('rejects a replay across HTTP requests', async () => {
    const signed = await idToken('apple');
    await request(app.getHttpServer()).post('/auth/social/apple').send({ idToken: signed }).expect(200);
    const replay = await request(app.getHttpServer()).post('/auth/social/apple').send({ idToken: signed }).expect(401);
    expect(replay.body.code).toBe('SOCIAL_TOKEN_REPLAY');
    expect(sessions.createSocialSession).toHaveBeenCalledOnce();
  });

  it('allows repeat Google login for the same account with fresh nonce-bound tokens', async () => {
    for (const nonce of ['first-device-request', 'second-device-request']) {
      const signed = await idToken('google', 'same-account', { nonce });
      await request(app.getHttpServer()).post('/auth/social/google')
        .send({ idToken: signed, nonce }).expect(200);
    }
    expect(sessions.createSocialSession).toHaveBeenCalledTimes(2);
    expect(identities.withAccount).toHaveBeenLastCalledWith(
      expect.objectContaining({ providerUserId: 'subject-same-account' }),
      undefined, expect.any(Function),
    );
  });

  it.each(['google', 'apple'] as const)('enforces the tight %s rate limit before verification/session issuance', async (provider) => {
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer()).post(`/auth/social/${provider}`)
        .send({ idToken: await idToken(provider, String(i)) }).expect(200);
    }
    await request(app.getHttpServer()).post(`/auth/social/${provider}`)
      .send({ idToken: await idToken(provider, 'sixth') }).expect(429);
    expect(sessions.createSocialSession).toHaveBeenCalledTimes(5);
  });
});
