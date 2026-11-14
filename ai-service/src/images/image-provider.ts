import { FilterPrompt, GeneratedImage, ValidatedImage } from './image.types.js';

export const IMAGE_PROVIDER: unique symbol = Symbol('IMAGE_PROVIDER');

export interface ImageProvider {
  enhance(image: ValidatedImage, prompt: FilterPrompt, signal: AbortSignal): Promise<GeneratedImage>;
}
