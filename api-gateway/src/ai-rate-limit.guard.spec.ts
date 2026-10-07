import type { ExecutionContext } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { AiRateLimitGuard } from './ai-rate-limit.guard.js';

describe('AiRateLimitGuard', () => {
  const ip = '198.51.100.25';
  const handler = () => undefined;
  class TestController {}

  function context(path: string): {
    executionContext: ExecutionContext;
    response: { setHeader: ReturnType<typeof vi.fn> };
  } {
    const response = { setHeader: vi.fn() };
    const executionContext = {
      getClass: () => TestController,
      getHandler: () => handler,
      switchToHttp: () => ({
        getRequest: () => ({ ip, originalUrl: path, socket: { remoteAddress: '203.0.113.1' } }),
        getResponse: () => response,
        getNext: () => undefined,
      }),
    } as unknown as ExecutionContext;
    return { executionContext, response };
  }

  it('uses the client IP and configured five-per-minute limit, rejecting the sixth request', async () => {
    let hits = 0;
    const storage = {
      increment: vi.fn(async (_key: string, ttl: number, limit: number) => {
        hits += 1;
        return {
          totalHits: hits,
          timeToExpire: Math.ceil(ttl / 1000),
          isBlocked: hits > limit,
          timeToBlockExpire: hits > limit ? Math.ceil(ttl / 1000) : 0,
        };
      }),
    };
    const config = {
      getOrThrow: vi.fn((key: string) => ({
        AI_RATE_LIMIT_MAX: 5,
        AI_RATE_LIMIT_WINDOW_MS: 60_000,
      })[key]),
    };
    const guard = new AiRateLimitGuard(config as never, storage as never, new Reflector());
    await guard.onModuleInit();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(guard.canActivate(context('/ai/enhance').executionContext)).resolves.toBe(true);
    }
    const sixth = context('/ai/enhance');
    const sixthError = await guard.canActivate(sixth.executionContext).catch((error: unknown) => error);
    expect(sixthError).toBeInstanceOf(ThrottlerException);
    expect((sixthError as ThrottlerException).getStatus()).toBe(429);
    expect(sixth.response.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');

    expect(storage.increment).toHaveBeenCalledTimes(6);
    expect(storage.increment).toHaveBeenLastCalledWith(ip, 60_000, 5, 60_000, 'ai');
    expect(config.getOrThrow).toHaveBeenCalledWith('AI_RATE_LIMIT_MAX');
    expect(config.getOrThrow).toHaveBeenCalledWith('AI_RATE_LIMIT_WINDOW_MS');
  });

  it('does not consume the AI counter for non-AI routes', async () => {
    const storage = { increment: vi.fn() };
    const config = {
      getOrThrow: vi.fn((key: string) => ({
        AI_RATE_LIMIT_MAX: 5,
        AI_RATE_LIMIT_WINDOW_MS: 60_000,
      })[key]),
    };
    const guard = new AiRateLimitGuard(config as never, storage as never, new Reflector());
    await guard.onModuleInit();

    const nonAi = context('/auth/login');
    await expect(guard.canActivate(nonAi.executionContext)).resolves.toBe(true);
    expect(storage.increment).not.toHaveBeenCalled();
    expect(nonAi.response.setHeader).not.toHaveBeenCalled();
  });
});
