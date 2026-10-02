import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { RedactingLogger } from '@loccoc/common';
import { AppModule } from './app.module.js';

const app = await NestFactory.create(AppModule, { logger: new RedactingLogger() });
await app.listen(app.get(ConfigService).getOrThrow<number>('AUTH_PORT'));
