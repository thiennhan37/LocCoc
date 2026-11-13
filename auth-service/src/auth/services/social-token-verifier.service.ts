import { Inject, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { isEmail } from 'class-validator';
import { createRemoteJWKSet, errors, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { SocialProvider } from '../entities/identity.entity.js';

export const SOCIAL_JWKS = Symbol('SOCIAL_JWKS');
export type SocialJwks = Record<SocialProvider, JWTVerifyGetKey>;

export interface VerifiedSocialIdentity {
  provider: SocialProvider;
  providerUserId: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  isPrivateEmail: boolean;
  expiresAt: number;
}

export function createSocialJwks(): SocialJwks {
  const options = { timeoutDuration: 5_000, cooldownDuration: 30_000, cacheMaxAge: 600_000 };
  // Fixed, provider-owned endpoints only: never follow a token's jku/x5u/jwk.
  return {
    google: createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'), options),
    apple: createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'), options),
  };
}

@Injectable()
export class SocialTokenVerifier {
  constructor(
    private readonly config: ConfigService,
    @Inject(SOCIAL_JWKS) private readonly jwks: SocialJwks,
  ) {}

  async verify(provider: SocialProvider, idToken: string, nonce?: string): Promise<VerifiedSocialIdentity> {
    const audiences = this.config.get<string>(provider === 'google' ? 'GOOGLE_CLIENT_IDS' : 'APPLE_CLIENT_IDS', '')
      .split(',').map((value) => value.trim()).filter(Boolean);
    if (!audiences.length || audiences.includes('*')) {
      throw new ServiceUnavailableException('Social provider is not configured');
    }
    try {
      const { payload } = await jwtVerify(idToken, this.jwks[provider], {
        algorithms: ['RS256'],
        issuer: provider === 'google' ? ['https://accounts.google.com', 'accounts.google.com'] : 'https://appleid.apple.com',
        audience: audiences,
        requiredClaims: ['sub', 'iat', 'exp'],
        clockTolerance: 0,
      });
      if (typeof payload.sub !== 'string' || !payload.sub.trim() || payload.sub.length > 255 ||
          typeof payload.iat !== 'number' || payload.iat > Math.floor(Date.now() / 1000) ||
          typeof payload.exp !== 'number' || payload.exp <= payload.iat ||
          (payload.azp !== undefined && (typeof payload.azp !== 'string' || !audiences.includes(payload.azp))) ||
          (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp === undefined)) {
        throw new UnauthorizedException();
      }
      if (nonce !== undefined || payload.nonce !== undefined) {
        // The client supplies the exact nonce used in its outstanding provider
        // request (already hashed if its Apple SDK requires hashing). Never
        // silently skip the check when a token contains nonce but the body does not.
        if (typeof payload.nonce !== 'string' || !nonce) throw new UnauthorizedException();
        const actual = Buffer.from(payload.nonce);
        const expected = Buffer.from(nonce);
        if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new UnauthorizedException();
      }
      const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : null;
      if (email !== null && (email.length > 320 || !isEmail(email))) throw new UnauthorizedException();
      return {
        provider,
        providerUserId: payload.sub,
        email,
        emailVerified: payload.email_verified === true || (provider === 'apple' && payload.email_verified === 'true'),
        name: provider === 'google' && typeof payload.name === 'string' ? payload.name.trim().slice(0, 200) || null : null,
        isPrivateEmail: provider === 'apple' && (payload.is_private_email === true || payload.is_private_email === 'true' ||
          (email?.endsWith('@privaterelay.appleid.com') ?? false)),
        expiresAt: payload.exp,
      };
    } catch (error) {
      // Provider/network failures fail closed, and no raw token/claims or
      // provider exception details are exposed to callers or written to logs.
      if (error instanceof errors.JWKSTimeout || error instanceof errors.JWKSInvalid || error instanceof TypeError ||
          (error instanceof errors.JOSEError && error.code === 'ERR_JOSE_GENERIC')) {
        throw new ServiceUnavailableException('Social verification is temporarily unavailable');
      }
      throw new UnauthorizedException('Invalid social ID token');
    }
  }
}
