import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { fileURLToPath } from 'node:url';
import {
  validateNotificationEnvironment,
  AccountAuthorityClient,
  AccountAccessGuard,
} from '@loccoc/common';
import { Notifications1793318400001 } from './migration.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsRepository } from './notifications.repository.js';
import { NotificationsService } from './notifications.service.js';
import { CursorCodec } from './cursor.js';
import { NotificationWorkers } from './workers.js';
import { EmailOtpJobs1794960000001 } from './email-otp.migration.js';
import { BrevoEmailSender } from './brevo-email.sender.js';
import { EmailOtpRepository } from './email-otp.repository.js';
import { EmailOtpWorker } from './email-otp.worker.js';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [fileURLToPath(new URL('../.env', import.meta.url)), fileURLToPath(new URL('../../.env', import.meta.url))],
      validate: (input) => {
        const env = validateNotificationEnvironment(
          input,
          fileURLToPath(new URL('..', import.meta.url)),
        );
        return env;
      },
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (c: ConfigService) => ({
        type: 'postgres',
        host: c.getOrThrow('DB_HOST'),
        port: Number(c.get('DB_PORT', 5433)),
        username: c.getOrThrow('NOTIFICATION_DB_USER'),
        password: c.getOrThrow('NOTIFICATION_DB_PASSWORD'),
        database: c.getOrThrow('NOTIFICATION_DB_NAME'),
        migrations: [Notifications1793318400001, EmailOtpJobs1794960000001],
        migrationsRun: c.get('TYPEORM_MIGRATIONS_RUN') === true,
        synchronize: false,
      }),
    }),
  ],
  controllers: [NotificationsController],
  providers: [
    AccountAuthorityClient,
    CursorCodec,
    NotificationsRepository,
    NotificationsService,
    NotificationWorkers,
    BrevoEmailSender,
    EmailOtpRepository,
    EmailOtpWorker,
    { provide: APP_GUARD, useClass: AccountAccessGuard },
  ],
})
export class AppModule {}
