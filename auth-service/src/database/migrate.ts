import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { createAuthMigrationOptions } from './database.module.js';
import { Account } from '../auth/entities/account.entity.js';
import { Session } from '../auth/entities/session.entity.js';
import { RefreshToken } from '../auth/entities/refresh-token.entity.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../.env'] }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule], inject: [ConfigService], useFactory: createAuthMigrationOptions,
    }),
    TypeOrmModule.forFeature([Account, Session, RefreshToken]),
  ],
})
class MigrationModule {}

try {
  // No HTTP server, Redis, OTP sender or scheduled auth jobs are started.
  const app = await NestFactory.createApplicationContext(MigrationModule, { logger: false, abortOnError: false });
  await app.close();
  console.log('Auth database migrations completed (pending migrations only).');
} catch {
  console.error('Auth migrations failed. Check PostgreSQL availability, DB_HOST/DB_PORT and service database credentials.');
  process.exitCode = 1;
}
