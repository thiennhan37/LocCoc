import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExceptionFilter, requestIdMiddleware } from '@loccoc/common';
import { ChatSocketService } from './realtime/chat-socket.service.js';

export function configureChat(app: INestApplication): void {
  app.use(requestIdMiddleware);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new ApiExceptionFilter());
  const config = app.get(ConfigService);
  app.enableCors({ origin: config.getOrThrow<string>('CORS_ORIGINS').split(',').map(value => value.trim()) });
  app.get(ChatSocketService).attach(app.getHttpServer());
}
