import { Throttle } from '@nestjs/throttler';

export const RateLimit = (limit: number, ttlMs: number) => Throttle({ default: { limit, ttl: ttlMs } });
