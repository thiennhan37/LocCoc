import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { AuthRedisThrottlerStorage } from './auth-throttler.storage.js';
import { REDIS_CLIENT } from './redis.tokens.js';
export { REDIS_CLIENT } from './redis.tokens.js';

/** Injection token used by OTP, rate-limit and login-lockout services. */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    AuthRedisThrottlerStorage,
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Redis => {
        const url = config.get<string>('REDIS_URL', 'redis://127.0.0.1:6379');
        return new Redis(url, {
          // Let Nest finish booting while Redis is unavailable. Commands are
          // retried with bounded backoff and the service can recover later.
          maxRetriesPerRequest: 2,
          enableReadyCheck: true,
          retryStrategy: (attempt: number) => Math.min(attempt * 100, 2_000),
        });
      },
    },
  ],
  exports: [REDIS_CLIENT, AuthRedisThrottlerStorage],
})
export class RedisModule {}
