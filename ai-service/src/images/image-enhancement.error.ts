export type ImageEnhancementErrorCode =
  | 'INVALID_REQUEST'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'INVALID_AI_OUTPUT'
  | 'PROVIDER_OUTPUT_TOO_LARGE'
  | 'PROVIDER_FAILURE'
  | 'TIMEOUT'
  | 'CANCELLED';

export class ImageEnhancementError extends Error {
  constructor(
    public readonly code: ImageEnhancementErrorCode,
    public readonly safeMessage: string,
    cause?: unknown,
  ) {
    super(safeMessage, { cause });
    this.name = 'ImageEnhancementError';
  }
}
