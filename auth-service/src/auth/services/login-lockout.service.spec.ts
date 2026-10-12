import { describe, expect, it } from 'vitest';
import {
  InMemoryLockoutStore,
  LoginLockoutService,
  RedisLockoutStore,
} from './login-lockout.service.js';
import type { ConfigService } from '@nestjs/config';

describe('LoginLockoutService', () => {
  it('does not lock before reaching max attempts (5)', async () => {
    const store = new InMemoryLockoutStore();
    const service = new LoginLockoutService(store);

    for (let i = 0; i < 4; i++) {
      await service.recordFailure('user@example.com', '127.0.0.1');
      expect(await service.isLocked('user@example.com', '127.0.0.1')).toBe(false);
    }
  });

  it('locks after 5 failures and unlocks when cleared', async () => {
    const store = new InMemoryLockoutStore();
    const service = new LoginLockoutService(store);

    for (let i = 0; i < 5; i++) {
      await service.recordFailure('user@example.com', '127.0.0.1');
    }

    expect(await service.isLocked('user@example.com', '127.0.0.1')).toBe(true);

    await service.clear('user@example.com', '127.0.0.1');
    expect(await service.isLocked('user@example.com', '127.0.0.1')).toBe(false);
  });

  it('locks the account across different IPs to protect against distributed brute-force', async () => {
    const store = new InMemoryLockoutStore();
    const service = new LoginLockoutService(store);

    // 5 attempts from 5 distinct IP addresses targeting the same account
    for (let i = 1; i <= 5; i++) {
      await service.recordFailure('target@example.com', `192.168.1.${i}`);
    }

    // A 6th request from another IP should still see the account as locked
    expect(await service.isLocked('target@example.com', '10.0.0.1')).toBe(true);
  });

  it('respects custom configuration via ConfigService', async () => {
    const store = new InMemoryLockoutStore();
    const mockConfig = {
      get: (key: string) => {
        if (key === 'LOGIN_MAX_ATTEMPTS') return '3';
        if (key === 'LOGIN_LOCK_BASE_SECONDS') return '2';
        if (key === 'LOGIN_LOCK_MAX_SECONDS') return '300';
        return undefined;
      },
    } as unknown as ConfigService;

    const service = new LoginLockoutService(store, mockConfig);
    expect(service.maxAttempts).toBe(3);
    expect(service.baseLockSeconds).toBe(2);
    expect(service.maxLockSeconds).toBe(300);

    for (let i = 0; i < 2; i++) {
      await service.recordFailure('custom@example.com', '127.0.0.1');
      expect(await service.isLocked('custom@example.com', '127.0.0.1')).toBe(false);
    }

    await service.recordFailure('custom@example.com', '127.0.0.1');
    expect(await service.isLocked('custom@example.com', '127.0.0.1')).toBe(true);
  });

  it('works with RedisLockoutStore with a mock redis client', async () => {
    const redisData = new Map<string, string>();
    const mockRedisClient = {
      get: async (key: string) => redisData.get(key) ?? null,
      set: async (key: string, value: string) => {
        redisData.set(key, value);
        return 'OK';
      },
      del: async (key: string) => {
        redisData.delete(key);
        return 1;
      },
    };

    const redisStore = new RedisLockoutStore(mockRedisClient);
    const service = new LoginLockoutService(redisStore);

    for (let i = 0; i < 5; i++) {
      await service.recordFailure('redis-test@example.com', '127.0.0.1');
    }

    expect(await service.isLocked('redis-test@example.com', '127.0.0.1')).toBe(true);
    expect(redisData.has('auth:lockout:account:redis-test@example.com')).toBe(true);

    await service.clear('redis-test@example.com', '127.0.0.1');
    expect(await service.isLocked('redis-test@example.com', '127.0.0.1')).toBe(false);
    expect(redisData.has('auth:lockout:account:redis-test@example.com')).toBe(false);
  });

  it('preserves lockout record in Redis with TTL >= maxLockSeconds so it does not disappear prematurely', async () => {
    const setTtls = new Map<string, number>();
    const redisData = new Map<string, string>();
    const mockRedisClient = {
      get: async (key: string) => redisData.get(key) ?? null,
      set: async (key: string, value: string, ...args: unknown[]) => {
        redisData.set(key, value);
        if (args[0] === 'EX') setTtls.set(key, args[1] as number);
        return 'OK';
      },
      del: async (key: string) => {
        redisData.delete(key);
        setTtls.delete(key);
        return 1;
      },
    };

    const redisStore = new RedisLockoutStore(mockRedisClient);
    const service = new LoginLockoutService(redisStore); // maxLockSeconds = 900

    for (let i = 0; i < 5; i++) {
      await service.recordFailure('persistent@example.com', '127.0.0.1');
    }

    const accountKey = 'auth:lockout:account:persistent@example.com';
    expect(redisData.has(accountKey)).toBe(true);
    // Key TTL in Redis must be at least 900 seconds, NOT 1 second!
    expect(setTtls.get(accountKey)).toBeGreaterThanOrEqual(900);
  });
});
