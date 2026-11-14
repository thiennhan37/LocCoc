import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ImageEnhancementController } from './image-enhancement.controller.js';
import { ImageEnhancementService } from './image-enhancement.service.js';
import { ImageValidationService } from './image-validation.service.js';
import { IMAGE_PROVIDER } from './image-provider.js';
import { GeminiImageAdapter } from './gemini-image.adapter.js';
import { FilterPromptRegistry } from './filter-prompt.registry.js';
import { ImageEnhancementLogger } from './image-enhancement.logger.js';

@Module({
  imports: [ConfigModule],
  controllers: [ImageEnhancementController],
  providers: [
    ImageValidationService,
    FilterPromptRegistry,
    ImageEnhancementLogger,
    ImageEnhancementService,
    {
      provide: IMAGE_PROVIDER,
      useFactory: (configService: ConfigService) => {
        return new GeminiImageAdapter({
          apiKey: configService.getOrThrow('GEMINI_API_KEY'),
          model: configService.getOrThrow('GEMINI_IMAGE_MODEL')
        });
      },
      inject: [ConfigService],
    },
  ],
})
export class ImagesModule {}
