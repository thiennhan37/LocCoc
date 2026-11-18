import sharp from 'sharp';
import { setImmediate } from 'node:timers/promises';
import { ImageEnhancementError } from './image-enhancement.error.js';
import type { GeneratedImage } from './image.types.js';

// Gemini's JPEG transport cannot carry alpha. Only remove chroma-key pixels
// connected to the canvas border; green details inside the white outline stay.
export async function createTransparentSticker(bytes: Buffer, signal?: AbortSignal): Promise<GeneratedImage> {
  const checkCancelled = (): void => {
    if (signal?.aborted) {
      throw signal.reason instanceof ImageEnhancementError ? signal.reason : new ImageEnhancementError('CANCELLED', 'Cancelled');
    }
  };
  try {
    checkCancelled();
    const { data, info } = await sharp(bytes, { limitInputPixels: 16_777_216, failOn: 'error' })
      .toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width, height } = info;
    checkCancelled();
    const count = width * height;
    const isKey = (pixel: number): boolean => {
      const offset = pixel * 4;
      const r = data[offset], g = data[offset + 1], b = data[offset + 2], a = data[offset + 3];
      return a !== 0 && g >= 140 && g - r >= 70 && g - b >= 70;
    };
    if (![0, width - 1, count - width, count - 1].every(isKey)) {
      throw new ImageEnhancementError('INVALID_AI_OUTPUT', 'Sticker background is not suitable for transparency');
    }
    const queue = new Uint32Array(count);
    let tail = 0;
    const visit = (pixel: number): void => {
      if (!isKey(pixel)) return;
      data[pixel * 4 + 3] = 0;
      queue[tail++] = pixel;
    };
    for (let x = 0; x < width; x++) { visit(x); visit(count - width + x); }
    for (let y = 0; y < height; y++) { visit(y * width); visit(y * width + width - 1); }
    for (let head = 0; head < tail; head++) {
      if (head % 16384 === 0) {
        await setImmediate();
        checkCancelled();
      }
      const pixel = queue[head];
      if (pixel % width > 0) visit(pixel - 1);
      if (pixel % width < width - 1) visit(pixel + 1);
      if (pixel >= width) visit(pixel - width);
      if (pixel < count - width) visit(pixel + width);
    }
    if (tail < count * 0.01 || count - tail < count * 0.01) {
      throw new ImageEnhancementError('INVALID_AI_OUTPUT', 'Sticker must contain a subject and transparent background');
    }
    const png = await sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
    checkCancelled();
    if (png.length > 20 * 1024 * 1024) {
      throw new ImageEnhancementError('PROVIDER_OUTPUT_TOO_LARGE', 'Provider output too large');
    }
    return { bytes: png, mimeType: 'image/png' };
  } catch (error) {
    if (error instanceof ImageEnhancementError) throw error;
    throw new ImageEnhancementError('INVALID_AI_OUTPUT', 'Invalid sticker output', error);
  }
}
