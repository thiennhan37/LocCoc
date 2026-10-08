import { beforeEach, describe, expect, it, vi } from 'vitest';

const redisState = vi.hoisted(() => ({
  connectCalls: 0,
  status: 'wait',
}));

vi.mock('ioredis', () => ({
  Redis: class FakeRedis {
    get status(): string {
      return redisState.status;
    }

    async connect(): Promise<void> {
      redisState.connectCalls += 1;
      if (redisState.status !== 'wait') {
        throw new Error('Redis is already connecting/connected');
      }
      redisState.status = 'ready';
    }

    disconnect(): void {
      redisState.status = 'end';
    }
  },
}));

import { RedisThrottlerStorage } from './redis-throttler.storage.js';

describe('RedisThrottlerStorage lifecycle', () => {
  beforeEach(() => {
    redisState.connectCalls = 0;
    redisState.status = 'wait';
  });

  it('allows Nest to initialize the same storage provider more than once', async () => {
    const config = { getOrThrow: () => 'redis://127.0.0.1:6379' };
    const storage = new RedisThrottlerStorage(config as never);

    await storage.onModuleInit();

    await expect(storage.onModuleInit()).resolves.toBeUndefined();
    expect(redisState.connectCalls).toBe(1);
  });
});
