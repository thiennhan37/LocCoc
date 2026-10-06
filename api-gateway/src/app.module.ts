import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { validateEnvironment } from '@loccoc/common';
import { HealthController } from './health.controller.js';
import { ServiceProxyController } from './service-proxy.controller.js';
import { IpThrottlerGuard } from './ip-throttler.guard.js';
import { RedisModule } from './redis.module.js';
import { RedisThrottlerStorage } from './redis-throttler.storage.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../.env'], validate: validateEnvironment }),
    RedisModule,
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [ConfigService, RedisThrottlerStorage],
      useFactory: (config: ConfigService, storage: RedisThrottlerStorage) => ({
        throttlers: [{ ttl: config.getOrThrow<number>('RATE_LIMIT_TTL_MS'), limit: config.getOrThrow<number>('RATE_LIMIT_MAX') }],
        storage,
      }),
    }),
  ],
  controllers: [HealthController, ServiceProxyController],
  providers: [{ provide: APP_GUARD, useClass: IpThrottlerGuard }],
})
export class AppModule {}

