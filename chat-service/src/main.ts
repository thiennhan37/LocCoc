import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { RedactingLogger } from '@loccoc/common';
import { AppModule } from './app.module.js';
import { configureChat } from './bootstrap.js';

const app = await NestFactory.create(AppModule, { logger: new RedactingLogger() });
configureChat(app); app.enableShutdownHooks();
const config = app.get(ConfigService);
await app.listen(config.getOrThrow<number>('CHAT_SERVICE_PORT'), config.getOrThrow<string>('SERVICE_BIND_HOST'));
