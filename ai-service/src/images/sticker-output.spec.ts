import sharp from 'sharp';
import { ImageEnhancementError } from './image-enhancement.error.js';
import { createTransparentSticker } from './sticker-output.js';

export async function stickerFixture(): Promise<Buffer> {
  return sharp({ create: { width: 64, height: 64, channels: 3, background: '#00ff00' } })
    .composite([{ input: await sharp({ create: { width: 32, height: 32, channels: 3, background: '#ffffff' } }).png().toBuffer(), left: 16, top: 16 },
      { input: await sharp({ create: { width: 16, height: 16, channels: 3, background: '#00ff00' } }).png().toBuffer(), left: 24, top: 24 }])
    .jpeg({ quality: 90, chromaSubsampling: '4:4:4' }).toBuffer();
}

describe('createTransparentSticker', () => {
  it('removes JPEG key background but preserves the white outline and enclosed green subject', async () => {
    const result = await createTransparentSticker(await stickerFixture());
    const { data, info } = await sharp(result.bytes).raw().toBuffer({ resolveWithObject: true });
    expect(result.mimeType).toBe('image/png');
    expect(info.channels).toBe(4);
    expect(data[3]).toBe(0);
    expect(data[(18 * 64 + 18) * 4 + 3]).toBe(255);
    expect(data[(32 * 64 + 32) * 4 + 3]).toBe(255);
  });

  it.each(['#00ff00', '#ffffff'])('rejects missing subject or missing key background (%s)', async background => {
    const bytes = await sharp({ create: { width: 32, height: 32, channels: 3, background } }).jpeg().toBuffer();
    await expect(createTransparentSticker(bytes)).rejects.toMatchObject({ code: 'INVALID_AI_OUTPUT' });
  });

  it('rejects corrupt output', async () => {
    await expect(createTransparentSticker(Buffer.from('invalid'))).rejects.toMatchObject({ code: 'INVALID_AI_OUTPUT' });
  });

  it('allows timers to run and preserves cancellation during local processing', async () => {
    const bytes = await sharp({ create: { width: 2048, height: 2048, channels: 3, background: '#00ff00' } }).jpeg().toBuffer();
    const controller = new AbortController();
    const processing = createTransparentSticker(bytes, controller.signal);
    const timer = setTimeout(() => controller.abort(new ImageEnhancementError('TIMEOUT', 'Timeout')), 10);
    try {
      await expect(processing).rejects.toMatchObject({ code: 'TIMEOUT' });
    } finally {
      clearTimeout(timer);
    }
  });
});
