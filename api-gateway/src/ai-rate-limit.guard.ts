import { type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { RedisThrottlerStorage } from './redis-throttler.storage.js';

@Injectable()
export class AiRateLimitGuard extends ThrottlerGuard {
  constructor(
    @Inject(ConfigService) config: ConfigService,
    @Inject(RedisThrottlerStorage) storage: RedisThrottlerStorage,
    @Inject(Reflector) reflector: Reflector,
  ) {
    const windowMs = config.getOrThrow<number>('AI_RATE_LIMIT_WINDOW_MS');
    super({
      throttlers: [{
        name: 'ai',
        ttl: windowMs,
        limit: config.getOrThrow<number>('AI_RATE_LIMIT_MAX'),
        blockDuration: windowMs,
        generateKey: (_context, tracker) => tracker,
      }],
    }, storage, reflector);
  }

  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ originalUrl?: string; url?: string }>();
    const path = String(request.originalUrl ?? request.url ?? '').split('?', 1)[0];
    return path !== '/ai' && !path.startsWith('/ai/');
  }

  protected async getTracker(request: Record<string, any>): Promise<string> {
    return String(request.ip ?? (request.socket as { remoteAddress?: string } | undefined)?.remoteAddress ?? 'unknown');
  }
}
