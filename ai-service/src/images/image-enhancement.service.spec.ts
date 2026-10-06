import { ImageEnhancementService } from './image-enhancement.service.js';
import { ImageValidationService } from './image-validation.service.js';
import { FilterPromptRegistry } from './filter-prompt.registry.js';
import { ImageProvider, IMAGE_PROVIDER } from './image-provider.js';
import { ImageEnhancementLogger, EnhancementLogEvent } from './image-enhancement.logger.js';
import { UploadedImage, GeneratedImage } from './image.types.js';
import { ImageEnhancementError } from './image-enhancement.error.js';

describe('ImageEnhancementService', () => {
  let service: ImageEnhancementService;
  let validationService: { validateInput: ReturnType<typeof vi.fn>; validateOutput: ReturnType<typeof vi.fn> };
  let promptRegistry: { get: ReturnType<typeof vi.fn> };
  let provider: { enhance: ReturnType<typeof vi.fn> };
  let logger: { record: ReturnType<typeof vi.fn> };
  let configService: { get: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    validationService = { 
      validateInput: vi.fn().mockResolvedValue({ bytes: Buffer.from('validated'), mimeType: 'image/png' }),
      validateOutput: vi.fn().mockImplementation((id, img) => Promise.resolve(img))
    };
    promptRegistry = { get: vi.fn().mockReturnValue({ id: 'handwritten_diary', prompt: 'test prompt' }) };
    provider = { enhance: vi.fn().mockResolvedValue({ bytes: Buffer.from('generated'), mimeType: 'image/png' }) };
    logger = { record: vi.fn() };
    configService = { get: vi.fn().mockReturnValue(60000) }; // for AI_REQUEST_TIMEOUT_MS

    service = new ImageEnhancementService(
      validationService as any,
      promptRegistry as any,
      provider as any,
      logger as any,
      configService as any
    );
  });

  const upload: UploadedImage = { bytes: Buffer.from('upload'), mimeType: 'image/png' };
  const context = { requestId: 'req-1' };

  it('validates image, looks up prompt, calls provider exactly once, and validates output', async () => {
    const result = await service.enhance(upload, 'handwritten_diary', context);
    expect(result).toEqual({ bytes: Buffer.from('generated'), mimeType: 'image/png' });
    
    expect(validationService.validateInput).toHaveBeenCalledExactlyOnceWith(upload);
    expect(promptRegistry.get).toHaveBeenCalledExactlyOnceWith('handwritten_diary');
    expect(provider.enhance).toHaveBeenCalledExactlyOnceWith(
      { bytes: Buffer.from('validated'), mimeType: 'image/png' },
      { id: 'handwritten_diary', prompt: 'test prompt' },
      expect.any(AbortSignal)
    );
    expect(validationService.validateOutput).toHaveBeenCalledExactlyOnceWith('handwritten_diary', { bytes: Buffer.from('generated'), mimeType: 'image/png' });
    expect(logger.record).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'SUCCESS', status: 200 }));
  });

  it('rejects on validation failure and logs event', async () => {
    validationService.validateInput.mockRejectedValue(new ImageEnhancementError('UNSUPPORTED_MEDIA_TYPE', 'Bad format'));
    await expect(service.enhance(upload, 'handwritten_diary', context)).rejects.toMatchObject({ code: 'UNSUPPORTED_MEDIA_TYPE' });
    expect(promptRegistry.get).not.toHaveBeenCalled();
    expect(provider.enhance).not.toHaveBeenCalled();
    expect(logger.record).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'VALIDATION_REJECTED', status: 415 }));
  });

  it('rejects unknown filter and maps to VALIDATION_REJECTED 400', async () => {
    promptRegistry.get.mockImplementation(() => { throw new ImageEnhancementError('INVALID_REQUEST', 'Unsupported image filter'); });
    await expect(service.enhance(upload, 'unknown', context)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(provider.enhance).not.toHaveBeenCalled();
    expect(logger.record).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'VALIDATION_REJECTED', status: 400 }));
  });

  it('timeout maps to TIMEOUT and aborts provider', async () => {
    configService.get.mockReturnValue(10);
    service = new ImageEnhancementService(validationService as any, promptRegistry as any, provider as any, logger as any, configService as any);
    
    provider.enhance.mockImplementation(async (img, prompt, signal) => {
      await new Promise(resolve => setTimeout(resolve, 50));
      if (signal.aborted) throw new ImageEnhancementError('TIMEOUT', 'Timeout');
      return { bytes: Buffer.from('generated'), mimeType: 'image/png' };
    });

    await expect(service.enhance(upload, 'handwritten_diary', context)).rejects.toMatchObject({ code: 'TIMEOUT' });
    expect(logger.record).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'TIMEOUT', status: 504 }));
  });

  it('caller abort stops result delivery', async () => {
    const controller = new AbortController();
    provider.enhance.mockImplementation(async (img, prompt, signal) => {
      controller.abort();
      if (signal.aborted) throw new ImageEnhancementError('CANCELLED', 'Cancelled');
      return { bytes: Buffer.from('generated'), mimeType: 'image/png' };
    });

    const removeListenerSpy = vi.spyOn(controller.signal, 'removeEventListener');

    await expect(service.enhance(upload, 'handwritten_diary', { ...context, callerSignal: controller.signal }))
      .rejects.toMatchObject({ code: 'CANCELLED' });
    expect(logger.record).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'CANCELLED', status: 499 }));
    expect(removeListenerSpy).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('provider errors remain sanitized', async () => {
    provider.enhance.mockRejectedValue(new ImageEnhancementError('PROVIDER_FAILURE', 'safe', new Error('raw error')));
    const error = await service.enhance(upload, 'handwritten_diary', context).catch(e => e);
    expect(error.code).toBe('PROVIDER_FAILURE');
    expect(error.message).not.toContain('raw error');
    expect(logger.record).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'PROVIDER_REJECTED', status: 502 }));
  });
  
  it('handles PROVIDER_OUTPUT_TOO_LARGE', async () => {
    provider.enhance.mockRejectedValue(new ImageEnhancementError('PROVIDER_OUTPUT_TOO_LARGE', 'Too large'));
    await expect(service.enhance(upload, 'handwritten_diary', context)).rejects.toMatchObject({ code: 'PROVIDER_OUTPUT_TOO_LARGE' });
    expect(logger.record).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'PROVIDER_REJECTED', status: 502 }));
  });
  
  it('handles fully opaque INVALID_AI_OUTPUT sticker result', async () => {
    provider.enhance.mockRejectedValue(new ImageEnhancementError('INVALID_AI_OUTPUT', 'Invalid'));
    await expect(service.enhance(upload, 'subject_sticker', context)).rejects.toMatchObject({ code: 'INVALID_AI_OUTPUT' });
    expect(logger.record).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'INVALID_OUTPUT', status: 422 }));
  });

  it('records have no secrets', async () => {
    provider.enhance.mockRejectedValue(new ImageEnhancementError('PROVIDER_FAILURE', 'safe', new Error('secret error msg')));
    await service.enhance(upload, 'handwritten_diary', context).catch(() => {});
    
    const event = logger.record.mock.calls[0][0];
    const stringified = JSON.stringify(event);
    
    expect(stringified).not.toContain('upload');
    expect(stringified).not.toContain('generated');
    expect(stringified).not.toContain('secret error msg');
    expect(stringified).not.toContain('test prompt');
    expect(stringified).not.toMatch(/[A-Za-z0-9+/]{20,}/); // simple base64 check
  });
});
