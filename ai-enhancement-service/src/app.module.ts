import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateAiEnvironment } from './config/ai-environment.js';
import { HealthController } from './health.controller.js';
import { ImagesModule } from './images/images.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '../.env', validate: validateAiEnvironment }),
    ImagesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
