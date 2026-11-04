import { Global, Inject, Module, OnModuleDestroy, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '@loccoc/common';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Redis | null => {
        if (config.get<string>('NODE_ENV') === 'test' || process.env.NODE_ENV === 'test') {
          return null;
        }
        const url = config.get<string>('REDIS_URL', 'redis://127.0.0.1:6379');
        return new Redis(url, {
          maxRetriesPerRequest: 2,
          enableReadyCheck: true,
          retryStrategy: (attempt: number) => Math.min(attempt * 100, 2_000),
        });
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnModuleDestroy {
  constructor(@Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis | null) {}

  async onModuleDestroy(): Promise<void> {
    if (this.redis && typeof this.redis.quit === 'function') {
      await this.redis.quit().catch(() => this.redis?.disconnect());
    }
  }
}
