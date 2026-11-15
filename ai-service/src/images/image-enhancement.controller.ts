import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  Body,
  BadRequestException,
  HttpException,
  Req,
  Res,
  CallHandler,
  ExecutionContext,
  NestInterceptor,
  Injectable,
  HttpCode,
  StreamableFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImageEnhancementService } from './image-enhancement.service.js';
import { EnhanceImageDto } from './enhance-image.dto.js';
import { ImageEnhancementError } from './image-enhancement.error.js';
import type { ImageEnhancementErrorCode } from './image-enhancement.error.js';
import type { Response } from 'express';
import type multer from 'multer';
import type { RequestWithId } from '@loccoc/common';
import type { Observable } from 'rxjs';

@Injectable()
export class CacheControlInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const res = context.switchToHttp().getResponse<Response>();
    res.setHeader('Cache-Control', 'no-store');
    return next.handle();
  }
}

@Controller('ai/images')
export class ImageEnhancementController {
  constructor(private readonly enhancementService: ImageEnhancementService) {}

  @Post('enhance')
  @HttpCode(200)
  @UseInterceptors(
    CacheControlInterceptor,
    FileInterceptor('image', {
      limits: {
        fileSize: 10 * 1024 * 1024, // 10 MiB limit
      },
    }),
  )
  async enhanceImage(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: EnhanceImageDto,
    @Req() req: RequestWithId,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    if (!file) {
      throw new BadRequestException('image is required');
    }

    const abortController = new AbortController();

    const onClientDisconnect = () => {
      if (!res.writableEnded) {
        abortController.abort(new ImageEnhancementError('CANCELLED', 'Cancelled'));
      }
    };

    req.on('aborted', onClientDisconnect);
    res.on('close', onClientDisconnect);

    try {
      const result = await this.enhancementService.enhance(
        {
          bytes: file.buffer,
          mimeType: file.mimetype,
        },
        dto.filterId,
        {
          requestId: req.requestId,
          callerSignal: abortController.signal,
        },
      );

      res.setHeader('Content-Type', result.mimeType);
      res.setHeader('Content-Length', result.bytes.length);
      return new StreamableFile(result.bytes);
    } catch (error) {
      if (error instanceof ImageEnhancementError) {
        const statusMap: Record<ImageEnhancementErrorCode, number> = {
          INVALID_REQUEST: 400,
          PAYLOAD_TOO_LARGE: 413,
          UNSUPPORTED_MEDIA_TYPE: 415,
          INVALID_AI_OUTPUT: 422,
          PROVIDER_OUTPUT_TOO_LARGE: 502,
          PROVIDER_FAILURE: 502,
          TIMEOUT: 504,
          CANCELLED: 499,
        };
        const status = statusMap[error.code] || 500;
        throw new HttpException(error.safeMessage, status, { cause: error });
      }
      throw error;
    } finally {
      req.removeListener('aborted', onClientDisconnect);
      res.removeListener('close', onClientDisconnect);
    }
  }
}
