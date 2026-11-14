import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImageValidationService } from './image-validation.service.js';
import { FilterPromptRegistry } from './filter-prompt.registry.js';
import type { ImageProvider } from './image-provider.js';
import { IMAGE_PROVIDER } from './image-provider.js';
import { ImageEnhancementLogger, EnhancementLogEvent } from './image-enhancement.logger.js';
import { UploadedImage, GeneratedImage, ImageFilterId } from './image.types.js';
import { AiEnvironment } from '../config/ai-environment.js';
import { ImageEnhancementError } from './image-enhancement.error.js';

@Injectable()
export class ImageEnhancementService {
  constructor(
    private readonly validationService: ImageValidationService,
    private readonly promptRegistry: FilterPromptRegistry,
    @Inject(IMAGE_PROVIDER) private readonly provider: ImageProvider,
    private readonly logger: ImageEnhancementLogger,
    private readonly configService: ConfigService<AiEnvironment, true>
  ) {}

  async enhance(
    upload: UploadedImage,
    filterId: string,
    context: { requestId: string; callerSignal?: AbortSignal }
  ): Promise<GeneratedImage> {
    const startTime = Date.now();
    let outcome: string = 'SUCCESS';
    let status = 200;
    let mimeType: string | undefined = undefined;
    let byteCount: number | undefined = undefined;

    const timeoutMs = this.configService.get('AI_REQUEST_TIMEOUT_MS', { infer: true });
    
    const abortController = new AbortController();
    const timeoutError = new ImageEnhancementError('TIMEOUT', 'Timeout');
    const timeoutId = setTimeout(() => abortController.abort(timeoutError), timeoutMs);
    
    const onCallerAbort = () => abortController.abort(context.callerSignal!.reason);
    if (context.callerSignal) {
      if (context.callerSignal.aborted) {
        abortController.abort(context.callerSignal.reason);
      } else {
        context.callerSignal.addEventListener('abort', onCallerAbort);
      }
    }

    try {
      const runPipeline = async () => {
        if (abortController.signal.aborted) throw abortController.signal.reason;

        const validated = await this.validationService.validateInput(upload).catch((err: unknown) => {
          if (err instanceof ImageEnhancementError) throw err;
          throw new ImageEnhancementError('INVALID_REQUEST', 'Validation failed', err);
        });

        const prompt = this.promptRegistry.get(filterId as ImageFilterId);

        const providerPromise = this.provider.enhance(validated, prompt, abortController.signal);
        providerPromise.catch(() => {});

        const generated = await providerPromise;
        const validatedOutput = await this.validationService.validateOutput(filterId as ImageFilterId, generated);
        return validatedOutput;
      };

      let abortListener: (() => void) | undefined;
      const abortPromise = new Promise<never>((_, reject) => {
        if (abortController.signal.aborted) return reject(abortController.signal.reason);
        abortListener = () => reject(abortController.signal.reason);
        abortController.signal.addEventListener('abort', abortListener);
      });

      const pipelinePromise = runPipeline();
      pipelinePromise.catch(() => {});

      const finalOutput = await Promise.race([pipelinePromise, abortPromise]).finally(() => {
        if (abortListener) abortController.signal.removeEventListener('abort', abortListener);
      });

      mimeType = finalOutput.mimeType;
      byteCount = finalOutput.bytes.length;

      return finalOutput;
    } catch (error: unknown) {
      let normalizedError = error;

      const isCallerAbort = context.callerSignal?.aborted && (error === context.callerSignal.reason || (error instanceof Error && error.name === 'AbortError'));
      const isTimeoutAbort = abortController.signal.aborted && (error === timeoutError || (error instanceof Error && error.name === 'AbortError'));

      if (isCallerAbort) {
        normalizedError = new ImageEnhancementError('CANCELLED', 'Cancelled');
      } else if (isTimeoutAbort) {
        normalizedError = new ImageEnhancementError('TIMEOUT', 'Timeout');
      }

      if (normalizedError instanceof ImageEnhancementError) {
        switch (normalizedError.code) {
          case 'INVALID_REQUEST':
            outcome = 'VALIDATION_REJECTED';
            status = 400;
            break;
          case 'PAYLOAD_TOO_LARGE':
            outcome = 'VALIDATION_REJECTED';
            status = 413;
            break;
          case 'UNSUPPORTED_MEDIA_TYPE':
            outcome = 'VALIDATION_REJECTED';
            status = 415;
            break;
          case 'INVALID_AI_OUTPUT':
            outcome = 'INVALID_OUTPUT';
            status = 422;
            break;
          case 'PROVIDER_OUTPUT_TOO_LARGE':
          case 'PROVIDER_FAILURE':
            outcome = 'PROVIDER_REJECTED';
            status = 502;
            break;
          case 'TIMEOUT':
            outcome = 'TIMEOUT';
            status = 504;
            break;
          case 'CANCELLED':
            outcome = 'CANCELLED';
            status = 499;
            break;
        }
        throw normalizedError;
      }

      outcome = 'PROVIDER_REJECTED';
      status = 502;
      throw new ImageEnhancementError('PROVIDER_FAILURE', 'Provider failed to process the request', error);
    } finally {
      clearTimeout(timeoutId);
      if (context.callerSignal) {
        context.callerSignal.removeEventListener('abort', onCallerAbort);
      }
      this.logger.record({
        requestId: context.requestId,
        filterId,
        mimeType,
        byteCount,
        durationMs: Date.now() - startTime,
        outcome: outcome as EnhancementLogEvent['outcome'],
        status,
      });
    }
  }
}
