import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { ImageValidationService } from './image-validation.service.js';

const imageValidation = new ImageValidationService();

describe('ImageValidationService', () => {
  it.each([
    ['image/jpeg', () => fixture('jpeg')],
    ['image/png', () => fixture('png')],
    ['image/webp', () => fixture('webp')],
  ] as const)('accepts a valid %s input signature', async (mimeType, createFixture) => {
    const bytes = await createFixture();

    await expect(imageValidation.validateInput({ bytes, mimeType })).resolves.toEqual({ bytes, mimeType });
  });

  it('rejects an input whose declared MIME type disagrees with its signature', async () => {
    const bytes = await fixture('jpeg');

    await expect(imageValidation.validateInput({ bytes, mimeType: 'image/png' })).rejects.toMatchObject({
      code: 'UNSUPPORTED_MEDIA_TYPE',
    });
  });

  it('rejects input bytes with no supported image signature', async () => {
    await expect(
      imageValidation.validateInput({ bytes: Buffer.from('not an image'), mimeType: 'image/png' }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_MEDIA_TYPE' });
  });

  it('rejects an input larger than 10 MiB before inspecting image content', async () => {
    await expect(
      imageValidation.validateInput({ bytes: Buffer.alloc(10_485_761), mimeType: 'image/png' }),
    ).rejects.toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
  });

  it('rejects corrupt provider output as invalid AI output', async () => {
    await expect(
      imageValidation.validateOutput('handwritten_diary', {
        bytes: Buffer.from('not an image'),
        mimeType: 'image/png',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_AI_OUTPUT' });
  });

  it('rejects a signature-valid truncated handwritten provider image as invalid AI output', async () => {
    const bytes = await fixture('jpeg');
    const truncatedBytes = bytes.subarray(0, bytes.length - 1);

    await expect(
      imageValidation.validateOutput('handwritten_diary', {
        bytes: truncatedBytes,
        mimeType: 'image/jpeg',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_AI_OUTPUT' });
  });

  it('rejects provider output larger than 20 MiB before inspecting image content', async () => {
    await expect(
      imageValidation.validateOutput('handwritten_diary', {
        bytes: Buffer.alloc(20_971_521),
        mimeType: 'image/png',
      }),
    ).rejects.toMatchObject({ code: 'PROVIDER_OUTPUT_TOO_LARGE' });
  });

  it('accepts a transparent PNG sticker output', async () => {
    const bytes = await fixture('png', 0);

    await expect(
      imageValidation.validateOutput('subject_sticker', { bytes, mimeType: 'image/png' }),
    ).resolves.toEqual({ bytes, mimeType: 'image/png' });
  });

  it('rejects an opaque PNG sticker output', async () => {
    const bytes = await fixture('png', 1);

    await expect(
      imageValidation.validateOutput('subject_sticker', { bytes, mimeType: 'image/png' }),
    ).rejects.toMatchObject({ code: 'INVALID_AI_OUTPUT' });
  });

  it('normalizes a signature-valid truncated sticker PNG decode failure as invalid AI output', async () => {
    const bytes = await fixture('png', 0);
    const truncatedBytes = bytes.subarray(0, bytes.length - 20);

    await expect(
      imageValidation.validateOutput('subject_sticker', { bytes: truncatedBytes, mimeType: 'image/png' }),
    ).rejects.toMatchObject({ code: 'INVALID_AI_OUTPUT' });
  });

  it('rejects a JPEG sticker output even when its declared MIME type is PNG', async () => {
    const bytes = await fixture('jpeg');

    await expect(
      imageValidation.validateOutput('subject_sticker', { bytes, mimeType: 'image/png' }),
    ).rejects.toMatchObject({ code: 'INVALID_AI_OUTPUT' });
  });
});

async function fixture(format: 'jpeg' | 'png' | 'webp', alpha = 1): Promise<Buffer> {
  const image = sharp({
    create: {
      width: 2,
      height: 2,
      channels: 4,
      background: { r: 30, g: 60, b: 90, alpha },
    },
  });

  return image.toFormat(format).toBuffer();
}
