import { Inject, Injectable } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
type ThrottlerStorageRecord = { totalHits: number; timeToExpire: number; isBlocked: boolean; timeToBlockExpire: number };
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from './redis.tokens.js';

const incrementScript = `
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
local blocked = hits > tonumber(ARGV[2])
return {hits, ttl, blocked and 1 or 0, 0}
`;

/** Shared auth route counters. The auth prefix is separate from the gateway
 * prefix because the two layers enforce different policies. */
@Injectable()
export class AuthRedisThrottlerStorage implements ThrottlerStorage {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    _blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const baseKey = `auth:throttle:${throttlerName}:${key}`;
    const result = await this.redis.eval(incrementScript, 1, baseKey, ttl, limit) as number[];
    return {
      totalHits: Number(result[0]),
      timeToExpire: Math.ceil(Number(result[1]) / 1000),
      isBlocked: Number(result[2]) === 1,
      timeToBlockExpire: 0,
    };
  }
}