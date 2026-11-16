import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { fileURLToPath } from 'node:url';
import {
  validateGatewayEnvironment,
  AccountAuthorityClient,
} from '@loccoc/common';
import { GatewayAccountAccessGuard } from './account-access.guard.js';
import { HealthController } from './health.controller.js';
import { ServiceProxyController } from './service-proxy.controller.js';
import { IpThrottlerGuard } from './ip-throttler.guard.js';
import { RedisModule } from './redis.module.js';
import { RedisThrottlerStorage } from './redis-throttler.storage.js';
import { AiRateLimitGuard } from './ai-rate-limit.guard.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: fileURLToPath(new URL('../.env', import.meta.url)),
      validate: validateGatewayEnvironment,
    }),
    RedisModule,
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [ConfigService, RedisThrottlerStorage],
      useFactory: (config: ConfigService, storage: RedisThrottlerStorage) => ({
        throttlers: [
          {
            ttl: config.getOrThrow<number>('RATE_LIMIT_TTL_MS'),
            limit: config.getOrThrow<number>('RATE_LIMIT_MAX'),
          },
        ],
        storage,
      }),
    }),
  ],
  controllers: [HealthController, ServiceProxyController],
  providers: [
    AccountAuthorityClient,
    { provide: APP_GUARD, useClass: IpThrottlerGuard },
    { provide: APP_GUARD, useClass: GatewayAccountAccessGuard },
    { provide: APP_GUARD, useClass: AiRateLimitGuard },
  ],
})
export class AppModule {}
