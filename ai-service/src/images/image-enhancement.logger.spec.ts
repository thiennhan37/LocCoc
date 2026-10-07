import { ImageEnhancementLogger, EnhancementLogEvent } from './image-enhancement.logger.js';
import { Logger } from '@nestjs/common';

describe('ImageEnhancementLogger', () => {
  it('logs only allowlisted fields securely', () => {
    const loggerMock = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const logger = new ImageEnhancementLogger();
    
    const event: EnhancementLogEvent = {
      requestId: 'req-123',
      filterId: 'handwritten_diary',
      mimeType: 'image/png',
      byteCount: 1024,
      durationMs: 1500,
      outcome: 'SUCCESS',
      status: 200,
    };
    
    // Add extra properties to make sure they are not logged
    const unsafeEvent = {
      ...event,
      secretBytes: Buffer.from('secret'),
      prompt: 'secret prompt',
      apiKey: 'secret key',
    } as any;
    
    logger.record(unsafeEvent);
    
    expect(loggerMock).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining('req-123'),
      {
        requestId: 'req-123',
        filterId: 'handwritten_diary',
        mimeType: 'image/png',
        byteCount: 1024,
        durationMs: 1500,
        outcome: 'SUCCESS',
        status: 200,
      }
    );
  });
});
