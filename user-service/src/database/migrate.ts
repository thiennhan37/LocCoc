import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { createUserMigrationOptions } from './database.module.js';
import { User } from '../users/entities/user.entity.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../.env'] }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule], inject: [ConfigService], useFactory: createUserMigrationOptions,
    }),
    TypeOrmModule.forFeature([User]),
  ],
})
class MigrationModule {}

try {
  // No HTTP server, Redis, OTP sender or scheduled auth jobs are started.
  const app = await NestFactory.createApplicationContext(MigrationModule, { logger: false, abortOnError: false });
  await app.close();
  console.log('User database migrations completed (pending migrations only).');
} catch {
  console.error('User migrations failed. Check PostgreSQL availability, DB_HOST/DB_PORT and service database credentials.');
  process.exitCode = 1;
}
