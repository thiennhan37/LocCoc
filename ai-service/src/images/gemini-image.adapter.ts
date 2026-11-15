import { GoogleGenAI, Interactions } from '@google/genai';
import { FilterPrompt, GeneratedImage, ValidatedImage } from './image.types.js';
import { ImageProvider } from './image-provider.js';
import { ImageEnhancementError } from './image-enhancement.error.js';

export class GeminiImageAdapter implements ImageProvider {
  private readonly client: GoogleGenAI;

  constructor(
    private readonly config: { apiKey: string; model: string },
    client?: GoogleGenAI,
  ) {
    this.client = client ?? new GoogleGenAI({ apiKey: config.apiKey });
  }

  async enhance(image: ValidatedImage, prompt: FilterPrompt, signal: AbortSignal): Promise<GeneratedImage> {
    const request: Interactions.CreateModelInteractionParamsNonStreaming = {
      model: this.config.model,
      store: false,
      stream: false,
      response_modalities: ['image'],
      input: [
        { type: 'text', text: prompt.prompt },
        { type: 'image', data: image.bytes.toString('base64'), mime_type: image.mimeType },
      ],
    };

    if (prompt.requiredOutputMime === 'image/png') {
      request.response_format = { type: 'image', mime_type: 'image/png' };
    }

    if (signal.aborted) {
      throw signal.reason instanceof ImageEnhancementError ? signal.reason : new ImageEnhancementError('CANCELLED', 'Cancelled');
    }

    try {
      const response = await this.client.interactions.create(request, { maxRetries: 0, fetchOptions: { signal } });

      if (signal.aborted) {
        throw signal.reason instanceof ImageEnhancementError ? signal.reason : new ImageEnhancementError('CANCELLED', 'Cancelled');
      }

      const responseObj = response as Record<string, unknown>;

      if (!responseObj || responseObj.status === 'failed' || !responseObj.steps || !Array.isArray(responseObj.steps) || responseObj.steps.length === 0) {
        throw new ImageEnhancementError('INVALID_AI_OUTPUT', 'Invalid AI output');
      }

      const modelOutputs = (responseObj.steps as unknown[]).filter((s): s is Record<string, unknown> => 
        typeof s === 'object' && s !== null && (s as Record<string, unknown>).type === 'model_output'
      );
      
      if (modelOutputs.length !== 1 || !modelOutputs[0].content || !Array.isArray(modelOutputs[0].content) || modelOutputs[0].content.length !== 1) {
        throw new ImageEnhancementError('INVALID_AI_OUTPUT', 'Invalid AI output');
      }

      const content = modelOutputs[0].content[0] as Record<string, unknown>;
      if (content.type !== 'image' || typeof content.data !== 'string' || typeof content.mime_type !== 'string' || content.uri) {
        throw new ImageEnhancementError('INVALID_AI_OUTPUT', 'Invalid AI output');
      }

      // Strict check for valid base64
      const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
      if (!base64Regex.test(content.data) || content.data.length % 4 !== 0 || content.data.length === 0) {
        throw new ImageEnhancementError('INVALID_AI_OUTPUT', 'Invalid AI output');
      }
      const decodedBytes = Buffer.from(content.data, 'base64');
      if (decodedBytes.toString('base64') !== content.data) {
        throw new ImageEnhancementError('INVALID_AI_OUTPUT', 'Invalid AI output');
      }
      
      // Decoded output above 20 MiB
      if (decodedBytes.length > 20971520) {
        throw new ImageEnhancementError('PROVIDER_OUTPUT_TOO_LARGE', 'Provider output too large');
      }

      return {
        bytes: decodedBytes,
        mimeType: content.mime_type,
      };
    } catch (error: unknown) {
      if (error instanceof ImageEnhancementError) {
        throw error;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        if (signal.reason instanceof ImageEnhancementError) {
           throw signal.reason;
        }
        throw new ImageEnhancementError('CANCELLED', 'Cancelled');
      }
      throw new ImageEnhancementError('PROVIDER_FAILURE', 'Provider failed to process the request', error);
    }
  }
}
