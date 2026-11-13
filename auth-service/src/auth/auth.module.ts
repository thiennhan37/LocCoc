import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtAuthGuard, JwtVerifier, RolesGuard } from '@loccoc/common';
import { REDIS_CLIENT, RedisModule } from '../database/redis.module.js';
import { AuthRedisThrottlerStorage } from '../database/auth-throttler.storage.js';
import { AuthController } from './auth.controller.js';
import { AccountAccessService } from './account-access.service.js';
import { LocalAccountAccessGuard } from './account-access.guard.js';
import { AccountStatusController } from './account-status.controller.js';
import { AccountEventsPublisher } from './account-events.publisher.js';
import {
  InternalAccountsController,
  InternalServiceGuard,
} from './internal-accounts.controller.js';
import { AuthService } from './auth.service.js';
import { SessionManagementController } from './session-management.controller.js';
import { SessionManagementService } from './session-management.service.js';
import { SessionManagementRepository } from './session-management.repository.js';
import { Account } from './entities/account.entity.js';
import { Session } from './entities/session.entity.js';
import { RefreshToken } from './entities/refresh-token.entity.js';
import {
  ConsoleOtpSender,
  OTP_SENDER,
  OTP_STORE,
  OtpService,
  RedisHashStore,
} from './services/otp.service.js';
import {
  LOCKOUT_STORE,
  LoginLockoutService,
  RedisLockoutStore,
} from './services/login-lockout.service.js';
import { PasswordService } from './services/password.service.js';
import { SessionCleanupService } from './services/session-cleanup.service.js';
import { TokenService } from './services/token.service.js';
import { Identity } from './entities/identity.entity.js';
import { IdentitiesRepository } from './identities.repository.js';
import { SocialAuthController } from './social-auth.controller.js';
import { SocialAuthService } from './services/social-auth.service.js';
import {
  createSocialJwks,
  SOCIAL_JWKS,
  SocialTokenVerifier,
} from './services/social-token-verifier.service.js';

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
    TypeOrmModule.forFeature([Account, Session, RefreshToken, Identity]),
    RedisModule,
  ],
  controllers: [
    AuthController,
    SessionManagementController,
    SocialAuthController,
    InternalAccountsController,
    AccountStatusController,
  ],
  providers: [
    PasswordService,
    AccountAccessService,
    InternalServiceGuard,
    AccountEventsPublisher,
    OtpService,
    LoginLockoutService,
    TokenService,
    SessionCleanupService,
    AuthService,
    SessionManagementService,
    SessionManagementRepository,
    IdentitiesRepository,
    SocialTokenVerifier,
    SocialAuthService,
    { provide: SOCIAL_JWKS, useFactory: createSocialJwks },
    JwtVerifier,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: LocalAccountAccessGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    {
      provide: OTP_STORE,
      inject: [REDIS_CLIENT],
      useFactory: (client: object) =>
        new RedisHashStore(
          client as ConstructorParameters<typeof RedisHashStore>[0],
        ),
    },
    {
      provide: LOCKOUT_STORE,
      inject: [REDIS_CLIENT],
      useFactory: (client: object) =>
        new RedisLockoutStore(
          client as ConstructorParameters<typeof RedisLockoutStore>[0],
        ),
    },
    { provide: OTP_SENDER, useClass: ConsoleOtpSender },
  ],
  exports: [
    AuthService,
    PasswordService,
    OtpService,
    TokenService,
    LoginLockoutService,
  ],
})
export class AuthModule {}
