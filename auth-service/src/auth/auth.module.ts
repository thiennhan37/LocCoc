import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtAuthGuard, JwtVerifier, RolesGuard } from '@loccoc/common';
import { REDIS_CLIENT, RedisModule } from '../database/redis.module.js';
import { AuthRedisThrottlerStorage } from '../database/auth-throttler.storage.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { Account } from './entities/account.entity.js';
import { Session } from './entities/session.entity.js';
import { RefreshToken } from './entities/refresh-token.entity.js';
import { ConsoleOtpSender, OTP_SENDER, OTP_STORE, OtpService, RedisHashStore } from './services/otp.service.js';
import { LOCKOUT_STORE, LoginLockoutService, RedisLockoutStore } from './services/login-lockout.service.js';
import { PasswordService } from './services/password.service.js';
import { SessionCleanupService } from './services/session-cleanup.service.js';
import { TokenService } from './services/token.service.js';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [AuthRedisThrottlerStorage],
      useFactory: (storage: AuthRedisThrottlerStorage) => ({
        throttlers: [{ ttl: 60_000, limit: 100 }],
        storage,
      }),
    }),
    TypeOrmModule.forFeature([Account, Session, RefreshToken]),
    RedisModule,
  ],
  controllers: [AuthController],
  providers: [
    PasswordService,
    OtpService,
    LoginLockoutService,
    TokenService,
    SessionCleanupService,
    AuthService,
    JwtVerifier,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    {
      provide: OTP_STORE,
      inject: [REDIS_CLIENT],
      useFactory: (client: object) => new RedisHashStore(client as ConstructorParameters<typeof RedisHashStore>[0]),
    },
    {
      provide: LOCKOUT_STORE,
      inject: [REDIS_CLIENT],
      useFactory: (client: object) => new RedisLockoutStore(client as ConstructorParameters<typeof RedisLockoutStore>[0]),
    },
    { provide: OTP_SENDER, useClass: ConsoleOtpSender },
  ],
  exports: [AuthService, PasswordService, OtpService, TokenService, LoginLockoutService],
})
export class AuthModule {}