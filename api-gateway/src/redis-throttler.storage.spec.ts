import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

const redisState = vi.hoisted(() => ({
  connectCalls: 0,
  status: 'wait',
  instance: undefined as EventEmitter | undefined,
}));

vi.mock('ioredis', () => ({
  Redis: class FakeRedis extends EventEmitter {
    constructor() {
      super();
      redisState.instance = this;
    }
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

  it.each(['connecting', 'connect'])('waits for an existing %s connection', async (status) => {
    const storage = new RedisThrottlerStorage({ getOrThrow: () => 'redis://localhost' } as never);
    redisState.status = status;
    let initialized = false;
    const pending = storage.onModuleInit().then(() => { initialized = true; });
    await Promise.resolve();
    expect(initialized).toBe(false);
    redisState.status = 'ready';
    redisState.instance!.emit('ready');
    await pending;
    expect(redisState.connectCalls).toBe(0);
    expect(redisState.instance!.listenerCount('error')).toBe(0);
  });

  it('rejects a connection failure and removes lifecycle listeners', async () => {
    const storage = new RedisThrottlerStorage({ getOrThrow: () => 'redis://localhost' } as never);
    redisState.status = 'connecting';
    const pending = storage.onModuleInit();
    const check = expect(pending).rejects.toThrow('connection failed');
    redisState.instance!.emit('error', new Error('connection failed'));
    await check;
    expect(redisState.instance!.listenerCount('ready')).toBe(0);
    expect(redisState.instance!.listenerCount('error')).toBe(0);
  });
});
