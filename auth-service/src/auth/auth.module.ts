import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { REDIS_CLIENT, RedisModule } from '../database/redis.module.js';
import { AuthRedisThrottlerStorage } from '../database/auth-throttler.storage.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { User } from './entities/user.entity.js';
import { ConsoleOtpSender, OTP_SENDER, OTP_STORE, OtpService, RedisHashStore } from './services/otp.service.js';
import { PasswordService } from './services/password.service.js';

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [AuthRedisThrottlerStorage],
      useFactory: (storage: AuthRedisThrottlerStorage) => ({
        throttlers: [{ ttl: 60_000, limit: 100 }],
        storage,
      }),
    }),
    TypeOrmModule.forFeature([User]),
    RedisModule,
  ],
  controllers: [AuthController],
  providers: [
    PasswordService,
    OtpService,
    AuthService,
    {
      provide: OTP_STORE,
      inject: [REDIS_CLIENT],
      useFactory: (client: object) => new RedisHashStore(client as ConstructorParameters<typeof RedisHashStore>[0]),
    },
    { provide: OTP_SENDER, useClass: ConsoleOtpSender },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
  exports: [AuthService, PasswordService, OtpService],
})
export class AuthModule {}
