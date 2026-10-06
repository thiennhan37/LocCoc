import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateAiEnvironment } from './config/ai-environment.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: '../.env', validate: validateAiEnvironment })],
  controllers: [HealthController],
})
export class AppModule {}
