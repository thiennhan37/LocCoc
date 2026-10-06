import { GoogleGenAI } from '@google/genai';
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
    const request: any = {
      model: this.config.model,
      store: false,
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
      throw new ImageEnhancementError('CANCELLED', 'Cancelled');
    }

    try {
      const response = await this.client.interactions.create(request, { maxRetries: 0, fetchOptions: { signal } });

      if (signal.aborted) {
        throw new ImageEnhancementError('CANCELLED', 'Cancelled');
      }

      if (!response || response.status === 'failed' || !response.steps || response.steps.length === 0) {
        throw new ImageEnhancementError('INVALID_AI_OUTPUT', 'Invalid AI output');
      }

      const modelOutputs = response.steps.filter((s) => s.type === 'model_output') as any[];
      if (modelOutputs.length !== 1 || !modelOutputs[0].content || modelOutputs[0].content.length !== 1) {
        throw new ImageEnhancementError('INVALID_AI_OUTPUT', 'Invalid AI output');
      }

      const content = modelOutputs[0].content[0];
      if (content.type !== 'image' || !content.data || content.uri) {
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
        mimeType: content.mime_type || 'image/png',
      };
    } catch (error: any) {
      if (error instanceof ImageEnhancementError) {
        throw error;
      }
      if (error.name === 'AbortError') {
        // Find 3: preserve abort reason. The abort error comes from our deadline or from caller.
        // If it's a deadline, signal.reason will be TIMEOUT. If caller, it's whatever caller aborted with.
        // Wait, the signal passed is `abortController.signal` from orchestration.
        // Orchestration sets signal.reason to the TIMEOUT error if it's a timeout.
        // So we can just check if signal.reason is an ImageEnhancementError, or if error is AbortError, throw signal.reason if it's an ImageEnhancementError.
        // Or actually, the orchestration service can just map it, but we need to ensure the adapter doesn't blindly convert it to CANCELLED.
        // The finding said: "The adapter must not blindly convert a deadline AbortError to CANCELLED."
        // Let's just throw the signal.reason if it's truthy, otherwise rethrow error. Or throw a generic cancellation.
        if (signal.reason instanceof Error || signal.reason?.code) {
           throw signal.reason;
        }
        throw new ImageEnhancementError('CANCELLED', 'Cancelled');
      }
      throw new ImageEnhancementError('PROVIDER_FAILURE', 'Provider failed to process the request');
    }
  }
}
