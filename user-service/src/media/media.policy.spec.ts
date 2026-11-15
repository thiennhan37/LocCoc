import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import {
  allowedMediaUrl,
  isMediaStorageOrigin,
  mediaKind,
  processMedia,
  rasterType,
} from './media.policy.js';

describe('profile raster policy', () => {
  it.each(['jpeg', 'png', 'webp'] as const)(
    'decodes %s and strips all metadata into WebP',
    async (format) => {
      const original = await sharp({
        create: { width: 120, height: 80, channels: 3, background: '#aa4433' },
      })
        .withMetadata({
          orientation: 6,
          exif: { IFD0: { Artist: 'private-device-and-gps' } },
        })
        .toFormat(format)
        .toBuffer();
      const output = await processMedia(original, 'avatar', `image/${format}`);
      const meta = await sharp(output).metadata();
      expect(meta.format).toBe('webp');
      for (const field of [
        'exif',
        'icc',
        'iptc',
        'xmp',
        'orientation',
      ] as const)
        expect(meta[field]).toBeUndefined();
      expect(meta.width).toBeLessThanOrEqual(1024);
      expect(meta.height).toBeLessThanOrEqual(1024);
    },
  );
  it.each([
    '<svg xmlns="http://www.w3.org/2000/svg"/>',
    '<html><script>alert(1)</script></html>',
    'GIF89a',
    '',
  ])('rejects unsafe or empty data', async (value) => {
    await expect(
      processMedia(Buffer.from(value), 'avatar', 'image/png'),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('rejects spoofed MIME, truncated JPEG and oversized input', async () => {
    const png = await sharp({
      create: { width: 4, height: 4, channels: 3, background: 'red' },
    })
      .png()
      .toBuffer();
    expect(rasterType(png)).toBe('image/png');
    await expect(
      processMedia(png, 'avatar', 'image/jpeg'),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      processMedia(Buffer.from([255, 216, 255, 0]), 'cover', 'image/jpeg'),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      processMedia(Buffer.alloc(5 * 1024 * 1024 + 1), 'avatar', 'image/jpeg'),
    ).rejects.toMatchObject({ status: 413 });
    await expect(
      processMedia(Buffer.alloc(10 * 1024 * 1024 + 1), 'cover', 'image/jpeg'),
    ).rejects.toMatchObject({ status: 413 });
  });
  it('limits pixel count and axis before full decoding', async () => {
    const wide = await sharp({
      create: { width: 12001, height: 1, channels: 3, background: 'red' },
    })
      .png()
      .toBuffer();
    await expect(
      processMedia(wide, 'cover', 'image/png'),
    ).rejects.toMatchObject({ status: 400 });
    const bomb = await sharp({
      create: { width: 6500, height: 6500, channels: 3, background: 'red' },
    })
      .png()
      .toBuffer();
    await expect(
      processMedia(bomb, 'cover', 'image/png'),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('rejects animated input even when the first frame is a valid raster', async () => {
    const animation = await sharp(
      Buffer.concat([
        Buffer.alloc(4 * 4 * 3, 40),
        Buffer.alloc(4 * 4 * 3, 200),
      ]),
      { raw: { width: 4, height: 8, channels: 3, pageHeight: 4 } },
    )
      .webp({ loop: 0, delay: [100, 100] })
      .toBuffer();
    expect((await sharp(animation, { animated: true }).metadata()).pages).toBe(
      2,
    );
    await expect(
      processMedia(animation, 'avatar', 'image/webp'),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('resizes a cover to 2048 x 683', async () => {
    const original = await sharp({
      create: { width: 3000, height: 2000, channels: 3, background: 'red' },
    })
      .jpeg()
      .toBuffer();
    const meta = await sharp(
      await processMedia(original, 'cover', 'image/jpeg'),
    ).metadata();
    expect([meta.width, meta.height]).toEqual([2048, 683]);
    expect(() => mediaKind('../avatar')).toThrow();
  });
});

describe('profile URL policy', () => {
  it('recognizes a managed origin despite host casing or path encoding', () => {
    expect(
      isMediaStorageOrigin(
        'https://IMAGES.test/bucket/%61.webp',
        'https://images.test/bucket',
      ),
    ).toBe(true);
    expect(
      isMediaStorageOrigin(
        'https://images.test.evil/bucket/a',
        'https://images.test/bucket',
      ),
    ).toBe(false);
  });
  const allowed = ['https://images.example.test'];
  const base = 'http://localhost:9000/loccoc-media';
  it('supports explicit HTTPS origins, managed development URLs and empty clear', () => {
    expect(allowedMediaUrl('', allowed, base, true)).toBe(true);
    expect(
      allowedMediaUrl('https://images.example.test/a.png', allowed, base, true),
    ).toBe(true);
    expect(allowedMediaUrl(`${base}/a.webp`, allowed, base, false)).toBe(true);
    expect(allowedMediaUrl(`${base}/a.webp`, allowed, base, true)).toBe(false);
  });
  it.each([
    null,
    'data:image/png;base64,a',
    'file:///tmp/a',
    'javascript:alert(1)',
    'https://other.test/a',
    'https://u:p@images.example.test/a',
    'https://images.example.test/a#x',
    'https://images.example.test/a?token=secret',
    'https://images.example.test.evil.test/a',
    'http://images.example.test/a',
    'https://images.example.test/a b',
    'https://images.example.test/\\evil',
  ])('rejects unsafe URL %s', (value) => {
    expect(allowedMediaUrl(value, allowed, base, false)).toBe(false);
  });
});
