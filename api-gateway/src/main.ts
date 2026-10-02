import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { configureGateway } from './bootstrap.js';

const app = await NestFactory.create(AppModule, { bufferLogs: true });
configureGateway(app);
app.enableShutdownHooks();
await app.listen(app.get(ConfigService).getOrThrow<number>('GATEWAY_PORT'));
