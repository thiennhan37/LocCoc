import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ApiExceptionFilter, RedactingLogger, requestIdMiddleware } from '@loccoc/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: new RedactingLogger(),
  });

  app.use(requestIdMiddleware);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new ApiExceptionFilter());

  await app.listen(app.get(ConfigService).getOrThrow<number>('AI_SERVICE_PORT'));
}

await bootstrap();
