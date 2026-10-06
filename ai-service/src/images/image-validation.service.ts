import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';

import { ImageEnhancementError } from './image-enhancement.error.js';
import type { GeneratedImage, ImageFilterId, SupportedImageMime, UploadedImage, ValidatedImage } from './image.types.js';

const MAX_INPUT_BYTES = 10_485_760;
const MAX_OUTPUT_BYTES = 20_971_520;
const SUPPORTED_IMAGE_MIMES = new Set<SupportedImageMime>(['image/jpeg', 'image/png', 'image/webp']);

export class ImageValidationService {
  async validateInput(upload: UploadedImage): Promise<ValidatedImage> {
    if (upload.bytes.length > MAX_INPUT_BYTES) {
      throw new ImageEnhancementError('PAYLOAD_TOO_LARGE', 'Image exceeds the 10 MiB limit');
    }

    const detectedMime = await detectSupportedMime(upload.bytes);
    if (!detectedMime || upload.mimeType !== detectedMime || !SUPPORTED_IMAGE_MIMES.has(upload.mimeType as SupportedImageMime)) {
      throw new ImageEnhancementError('UNSUPPORTED_MEDIA_TYPE', 'Only JPEG, PNG, and WebP images are supported');
    }

    await assertDecodable(upload.bytes, 'UNSUPPORTED_MEDIA_TYPE', 'Only JPEG, PNG, and WebP images are supported');
    return { bytes: upload.bytes, mimeType: detectedMime };
  }

  async validateOutput(filterId: ImageFilterId, image: GeneratedImage): Promise<GeneratedImage> {
    if (image.bytes.length > MAX_OUTPUT_BYTES) {
      throw new ImageEnhancementError('PROVIDER_OUTPUT_TOO_LARGE', 'AI returned an image larger than 20 MiB');
    }

    const detectedMime = await detectSupportedMime(image.bytes);
    if (!detectedMime) {
      throw invalidAiOutput();
    }

    const metadata = await assertDecodable(image.bytes, 'INVALID_AI_OUTPUT', 'AI did not return a valid image');
    if (filterId === 'subject_sticker') {
      if (detectedMime !== 'image/png' || !metadata.hasAlpha || !(await hasTransparentPixel(image.bytes))) {
        throw invalidAiOutput();
      }
    }

    return { bytes: image.bytes, mimeType: detectedMime };
  }
}

async function detectSupportedMime(bytes: Buffer): Promise<SupportedImageMime | undefined> {
  const detected = await fileTypeFromBuffer(bytes);
  return detected && SUPPORTED_IMAGE_MIMES.has(detected.mime as SupportedImageMime)
    ? (detected.mime as SupportedImageMime)
    : undefined;
}

async function assertDecodable(
  bytes: Buffer,
  code: 'UNSUPPORTED_MEDIA_TYPE' | 'INVALID_AI_OUTPUT',
  safeMessage: string,
) {
  try {
    return await sharp(bytes, { failOn: 'error' }).metadata();
  } catch (cause) {
    throw new ImageEnhancementError(code, safeMessage, cause);
  }
}

async function hasTransparentPixel(bytes: Buffer): Promise<boolean> {
  const { data, info } = await sharp(bytes, { failOn: 'error' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const alphaChannel = info.channels - 1;

  for (let index = alphaChannel; index < data.length; index += info.channels) {
    if (data[index] < 255) return true;
  }

  return false;
}

function invalidAiOutput(): ImageEnhancementError {
  return new ImageEnhancementError('INVALID_AI_OUTPUT', 'AI did not return a valid image');
}
