import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { chatDatabaseOptions, chatEnvPath, validateChatEnvironment } from '../config.js';

@Module({ imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: chatEnvPath, validate: validateChatEnvironment })] })
class MigrationConfig {}
let app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>> | undefined;
let db: DataSource | undefined;
try {
  app = await NestFactory.createApplicationContext(MigrationConfig, { logger: false, abortOnError: false });
  db = await new DataSource({ ...chatDatabaseOptions(app.get(ConfigService)), migrationsRun: false }).initialize();
  await db.runMigrations();
  console.log('Chat database migrations completed (pending migrations only).');
} catch {
  console.error('Chat migrations failed. Check service environment and database availability.'); process.exitCode = 1;
} finally { if (db?.isInitialized) await db.destroy(); await app?.close(); }
