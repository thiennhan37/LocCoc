import { EventEmitter } from 'node:events';
import { HttpException } from '@nestjs/common';
import type { Response } from 'express';
import type { RequestWithId } from '@loccoc/common';
import { ImageEnhancementController } from './image-enhancement.controller.js';
import type { ImageEnhancementService } from './image-enhancement.service.js';

describe('ImageEnhancementController', () => {
  it('cancels in-flight enhancement when the response connection closes', async () => {
    let signalStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => { signalStarted = resolve; });
    const enhance = vi.fn().mockImplementation((_upload, _filterId, context) => {
      signalStarted?.();
      return new Promise((_resolve, reject) => {
        context.callerSignal.addEventListener(
          'abort',
          () => reject(context.callerSignal.reason),
          { once: true },
        );
      });
    });
    const controller = new ImageEnhancementController({ enhance } as unknown as ImageEnhancementService);
    const request = Object.assign(new EventEmitter(), { requestId: 'req-1' }) as unknown as RequestWithId;
    const response = Object.assign(new EventEmitter(), {
      writableEnded: false,
      setHeader: vi.fn(),
    }) as unknown as Response;
    const file = {
      buffer: Buffer.from('image'),
      mimetype: 'image/png',
    } as Express.Multer.File;

    const pending = controller.enhanceImage(file, { filterId: 'handwritten_diary' }, request, response);
    await started;
    response.emit('close');

    const error = await pending.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(499);
    expect(request.listenerCount('aborted')).toBe(0);
    expect(response.listenerCount('close')).toBe(0);
  });
});
