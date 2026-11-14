export type ImageFilterId = 'handwritten_diary' | 'subject_sticker';

export type SupportedImageMime = 'image/jpeg' | 'image/png' | 'image/webp';

export interface UploadedImage {
  bytes: Buffer;
  mimeType: string;
}

export interface ValidatedImage {
  bytes: Buffer;
  mimeType: SupportedImageMime;
}

export interface GeneratedImage {
  bytes: Buffer;
  mimeType: string;
}

export interface FilterPrompt {
  id: ImageFilterId;
  prompt: string;
  requiredOutputMime?: 'image/png';
}
