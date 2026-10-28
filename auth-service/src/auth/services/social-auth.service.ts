import { Inject, Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../database/redis.tokens.js';
import { AuthService, type AuthRequestContext } from '../auth.service.js';
import type { SocialLoginDto } from '../dto/social-login.dto.js';
import type { SocialProvider } from '../entities/identity.entity.js';
import { IdentitiesRepository } from '../identities.repository.js';
import { SocialTokenVerifier } from './social-token-verifier.service.js';

@Injectable()
export class SocialAuthService {
  private readonly logger = new Logger(SocialAuthService.name);

  constructor(
    private readonly verifier: SocialTokenVerifier,
    private readonly identities: IdentitiesRepository,
    private readonly auth: AuthService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async login(provider: SocialProvider, dto: SocialLoginDto, context: AuthRequestContext = {}, appleName?: string): Promise<Record<string, unknown>> {
    const claims = await this.verifier.verify(provider, dto.idToken, dto.nonce);
    const ttl = claims.expiresAt - Math.floor(Date.now() / 1000);
    if (ttl <= 0) throw new UnauthorizedException('Invalid social ID token');
    // Hash the signed input, not its signature encoding: alternate base64url
    // spellings of the same signature must not bypass the replay marker.
    const signedInput = dto.idToken.split('.').slice(0, 2).join('.');
    const digest = createHash('sha256').update(signedInput).digest('hex');
    let consumed: string | null;
    try {
      // Atomic across replicas. Store a digest only, never the provider ID token.
      consumed = await this.redis.set(`auth:social:used:${provider}:${digest}`, '1', 'EX', ttl, 'NX');
    } catch {
      throw new ServiceUnavailableException('Social verification is temporarily unavailable');
    }
    if (consumed !== 'OK') {
      this.logger.warn({ event: 'social_sign_in_rejected', provider, reason: 'token_replay' });
      throw new UnauthorizedException({
        code: 'SOCIAL_TOKEN_REPLAY',
        message: 'Social ID token has already been used',
      });
    }
    return this.identities.withAccount(claims, appleName, (manager, account) =>
      this.auth.createSocialSession(manager, account, context));
  }
}
