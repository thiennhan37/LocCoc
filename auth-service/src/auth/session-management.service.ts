import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../database/redis.tokens.js';
import type { AuthenticatedContext } from './auth.service.js';
import type { ListSessionsDto } from './dto/list-sessions.dto.js';
import {
  SessionManagementRepository,
  type SessionRow,
} from './session-management.repository.js';

@Injectable()
export class SessionManagementService {
  private readonly logger = new Logger(SessionManagementService.name);
  constructor(
    private readonly repo: SessionManagementRepository,
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async list(current: AuthenticatedContext, query: ListSessionsDto) {
    const page = await this.repo.list(current.userId, query);
    return { ...page, items: page.items.map((s) => this.safeRow(s, current)) };
  }

  async history(current: AuthenticatedContext, query: ListSessionsDto) {
    const page = await this.repo.history(current.userId, query);
    return {
      ...page,
      items: page.items.map((s) => ({
        ...this.safeRow(s, current),
        status: s.status,
        revokedAt: s.revokedAt ? new Date(s.revokedAt).toISOString() : null,
      })),
    };
  }

  private safeRow(s: SessionRow, current: AuthenticatedContext) {
    const safeHint = (value: string | null, length: number) =>
      value?.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, length) || null;
    return {
      id: s.id,
      device: {
        platform: ['android', 'ios', 'web'].includes(s.platform ?? '')
          ? s.platform
          : 'unknown',
        userAgent: safeHint(s.userAgent, 512),
      },
      ip: s.ip,
      createdAt: new Date(s.createdAt).toISOString(),
      lastUsedAt: new Date(s.lastUsedAt).toISOString(),
      expiresAt: new Date(s.expiresAt).toISOString(),
      isCurrent: s.id.toLowerCase() === current.sessionId.toLowerCase(),
    };
  }

  async revoke(current: AuthenticatedContext, id: string) {
    const result = await this.repo.revoke(current.userId, id);
    // Publish only after the repository transaction has committed. The database
    // authority rejects this session even if the optional cache update fails.
    if (result.revoked) {
      try {
        await this.redis.set(
          `auth:revoked:sid:${result.sessionId}`,
          '1',
          'EX',
          this.config.get<number>('JWT_ACCESS_TTL_SECONDS', 900),
        );
      } catch {
        this.logger.warn(
          'Session revoked; revocation cache update unavailable',
        );
      }
    }
    return {
      ...result,
      isCurrent:
        result.sessionId.toLowerCase() === current.sessionId.toLowerCase(),
    };
  }
}
