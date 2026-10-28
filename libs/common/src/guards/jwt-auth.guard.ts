import { CanActivate, ExecutionContext, Inject, Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/auth.decorator.js';
import { JwtVerifier } from '../security/jwt-verifier.js';
import { REDIS_CLIENT } from '../security/redis-tokens.js';
import type { AuthenticatedUser, JwtPayload } from '../interfaces/authenticated-user.js';

interface RedisClient {
  get(key: string): Promise<string | null>;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
    private readonly verifier: JwtVerifier,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: RedisClient | null,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()])) return true;
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const value = request.headers.authorization;
    if (!value?.startsWith('Bearer ')) throw new UnauthorizedException('Authentication required');
    const token = value.slice(7).trim();
    const payload = this.verifier.verify(token, {
      publicKey: this.config.getOrThrow<string>('JWT_PUBLIC_KEY'),
      issuer: this.config.get<string>('JWT_ISSUER', 'loccoc-auth'),
      audience: this.config.get<string>('JWT_AUDIENCE', 'loccoc-api'),
      kid: this.config.get<string>('JWT_KID', 'loccoc-2026-01'),
      algorithm: 'RS256',
    });
    if (this.redis) {
      const revoked = await this.redis.get(`auth:revoked:sid:${payload.sid}`);
      if (revoked) throw new UnauthorizedException('Token has been revoked');
    }
    request.user = this.toAuthenticatedUser(payload);
    return true;
  }

  private toAuthenticatedUser(payload: JwtPayload): AuthenticatedUser {
    return {
      userId: payload.sub,
      role: payload.role,
      roles: [payload.role],
      scopes: [],
      sessionId: payload.sid,
      issuer: payload.iss,
      audience: payload.aud,
    };
  }
}