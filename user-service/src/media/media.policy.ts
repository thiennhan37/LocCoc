import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import sharp from 'sharp';

export type MediaKind = 'avatar' | 'cover';
export const mediaLimit = (kind: MediaKind) =>
  (kind === 'avatar' ? 5 : 10) * 1024 * 1024;
export function mediaKind(value: string): MediaKind {
  if (value !== 'avatar' && value !== 'cover') throw invalidMedia();
  return value;
}
export const invalidMedia = () =>
  new BadRequestException({
    code: 'INVALID_MEDIA',
    message: 'Use a valid single-frame JPEG, PNG or WebP image',
  });
export function isMediaStorageOrigin(
  value: string,
  publicBase: string,
): boolean {
  try {
    return new URL(value).origin === new URL(publicBase).origin;
  } catch {
    return false;
  }
}

export function rasterType(bytes: Buffer): string | undefined {
  if (
    bytes.length >= 3 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255
  )
    return 'image/jpeg';
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return 'image/png';
  if (
    bytes.length >= 12 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  )
    return 'image/webp';
  return undefined;
}

export async function processMedia(
  bytes: Buffer,
  kind: MediaKind,
  mime: string,
): Promise<Buffer> {
  if (bytes.length > mediaLimit(kind))
    throw new PayloadTooLargeException({
      code: 'MEDIA_TOO_LARGE',
      message: 'Image exceeds upload limit',
    });
  if (!bytes.length || !rasterType(bytes) || rasterType(bytes) !== mime)
    throw invalidMedia();
  try {
    const image = sharp(bytes, {
      limitInputPixels: 40_000_000,
      failOn: 'warning',
      animated: true,
    });
    const metadata = await image.metadata();
    if (
      !metadata.width ||
      !metadata.height ||
      metadata.width > 12000 ||
      metadata.height > 12000 ||
      metadata.width * metadata.height > 40_000_000 ||
      (metadata.pages ?? 1) !== 1
    )
      throw invalidMedia();
    // rotate() applies orientation before stripping ALL metadata (sharp's default).
    return await image
      .timeout({ seconds: 10 })
      .rotate()
      .resize(kind === 'avatar' ? 1024 : 2048, kind === 'avatar' ? 1024 : 683, {
        fit: 'cover',
        withoutEnlargement: true,
      })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    throw invalidMedia();
  }
}

export function allowedMediaUrl(
  value: unknown,
  allowedOrigins: string[],
  publicBase: string,
  production: boolean,
): boolean {
  if (value === '') return true;
  if (typeof value !== 'string' || value.length > 1024 || /\s|\\/.test(value))
    return false;
  for (let i = 0; i < value.length; i++)
    if (value.charCodeAt(i) < 32 || value.charCodeAt(i) === 127) return false;
  try {
    const url = new URL(value);
    if (url.username || url.password || url.hash || !url.hostname || url.search)
      return false;
    const base = publicBase ? new URL(publicBase) : undefined;
    const managed =
      base &&
      url.origin === base.origin &&
      url.pathname.startsWith(base.pathname.replace(/\/$/, '') + '/');
    return (
      (url.protocol === 'https:' &&
        (managed || allowedOrigins.includes(url.origin))) ||
      (!production && url.protocol === 'http:' && !!managed)
    );
  } catch {
    return false;
  }
}
