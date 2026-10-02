import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExceptionFilter, RedactingLogger, requestIdMiddleware } from '@loccoc/common';
import helmet from 'helmet';

export function configureGateway(app: INestApplication): void {
  const config = app.get(ConfigService);
  const origins = config.getOrThrow<string>('CORS_ORIGINS').split(',').map((origin) => origin.trim());
  app.useLogger(new RedactingLogger());
  // Trust one ingress proxy so req.ip (and therefore the limiter key) is stable behind a load balancer.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.use(requestIdMiddleware);
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.enableCors({ origin: origins, credentials: true });
  // whitelist: true: Tự động lọc bỏ các field không được khai báo trong DTO.
  // forbidNonWhitelisted: true: Báo lỗi 400 nếu có field không được khai báo trong DTO.
  // transform: true: Tự động transform dữ liệu đầu vào sang DTO.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new ApiExceptionFilter());
}
