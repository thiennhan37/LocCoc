import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedactingLogger } from '@loccoc/common';
import { AppModule } from './app.module.js';

const app = await NestFactory.create(AppModule, { logger: new RedactingLogger() });
// Auth is reachable only behind the trusted gateway in production.
app.getHttpAdapter().getInstance().set('trust proxy', 1);
app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
await app.listen(app.get(ConfigService).getOrThrow<number>('AUTH_PORT'));
