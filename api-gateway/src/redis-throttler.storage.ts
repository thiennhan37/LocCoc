import { Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { Redis } from 'ioredis';

// One atomic command handles concurrent gateway replicas and preserves expiry.
// KEYS[1]: key
// KEYS[2]: block key
// ARGV[1]: ttl (thời gian sống của key)
// ARGV[2]: limit (số lượng request)
// ARGV[3]: block duration (thời gian bị block)
const incrementScript = `
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
local blocked = hits > tonumber(ARGV[2])
if blocked and tonumber(ARGV[3]) > 0 then
  if redis.call('EXISTS', KEYS[2]) == 0 then redis.call('SET', KEYS[2], 1, 'PX', ARGV[3]) end
end
local blockTtl = redis.call('PTTL', KEYS[2])
return {hits, ttl, blocked and 1 or 0, blockTtl}
`;

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage, OnModuleInit, OnApplicationShutdown {
  private readonly redis: Redis;

  constructor(config: ConfigService) {
    this.redis = new Redis(config.getOrThrow<string>('REDIS_URL'), {
      lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false,
    });
  }

  async onModuleInit(): Promise<void> {
    if (this.redis.status === 'ready') return;
    if (this.redis.status === 'wait') {
      await this.redis.connect();
      return;
    }
    if (this.redis.status === 'connecting' || this.redis.status === 'connect') {
      await new Promise<void>((resolve, reject) => {
        const onReady = () => { cleanup(); resolve(); };
        const onError = (error: Error) => { cleanup(); reject(error); };
        const cleanup = () => {
          this.redis.off('ready', onReady);
          this.redis.off('error', onError);
        };
        this.redis.once('ready', onReady);
        this.redis.once('error', onError);
      });
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.redis.status !== 'end') this.redis.disconnect();
  }

  async increment(key: string, ttl: number, limit: number, blockDuration: number, throttlerName: string) {
    const baseKey = `throttle:${throttlerName}:${key}`;
    // 2: số lượng key truyền vào (baseKey, ${baseKey}:block)
    // ttl, limit, blockDuration: tham số truyền vào script
    const result = await this.redis.eval(incrementScript, 2, baseKey, `${baseKey}:block`, ttl, limit, blockDuration) as number[];
    return {
      totalHits: Number(result[0]),
      timeToExpire: Math.ceil(Number(result[1]) / 1000),
      isBlocked: Number(result[2]) === 1,
      timeToBlockExpire: Math.ceil(Math.max(0, Number(result[3])) / 1000),
    };
  }
}

