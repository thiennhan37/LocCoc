import { FilterPromptRegistry } from './filter-prompt.registry.js';
import { GeminiImageAdapter } from './gemini-image.adapter.js';
import { GoogleGenAI } from '@google/genai';

const source = { bytes: Buffer.from('source-image-secret'), mimeType: 'image/png' as const };
const output = { type: 'image', mime_type: 'image/png', data: 'aW1hZ2U=' };
const prompts = new FilterPromptRegistry();

function fixture(response: unknown = { status: 'completed', steps: [{ type: 'model_output', content: [output] }] }) {
  const create = vi.fn().mockResolvedValue(response);
  const client = { interactions: { create } } as unknown as GoogleGenAI;
  return { create, adapter: new GeminiImageAdapter({ apiKey: 'secret-key', model: 'configured-model' }, client) };
}

describe('GeminiImageAdapter', () => {
  it('sends one stateless inline editing request with configured model and no SDK retries', async () => {
    const { create, adapter } = fixture();
    const signal = new AbortController().signal;
    await expect(adapter.enhance(source, prompts.get('handwritten_diary'), signal)).resolves.toEqual({
      bytes: Buffer.from('image'), mimeType: 'image/png',
    });
    expect(create).toHaveBeenCalledExactlyOnceWith({
      model: 'configured-model', store: false, response_modalities: ['image'],
      input: [
        { type: 'text', text: prompts.get('handwritten_diary').prompt },
        { type: 'image', data: 'c291cmNlLWltYWdlLXNlY3JldA==', mime_type: 'image/png' },
      ],
    }, { fetchOptions: { signal }, maxRetries: 0 });
  });

  it('requests PNG for the sticker filter', async () => {
    const { create, adapter } = fixture();
    await adapter.enhance(source, prompts.get('subject_sticker'), new AbortController().signal);
    expect(create.mock.calls[0][0].response_format).toEqual({ type: 'image', mime_type: 'image/png' });
  });

  it.each([
    {}, { steps: [] },
    { steps: [{ type: 'model_output', content: [{ type: 'text', text: 'secret refusal' }] }] },
    { steps: [{ type: 'model_output', content: [output, output] }] },
    { steps: [{ type: 'model_output', content: [output] }, { type: 'model_output', content: [output] }] },
    ...['', '!!!!', 'aW1hZ2U=garbage', 'aW1hZ2V=', 'aW1h Z2U='].map(data => ({ steps: [{ type: 'model_output', content: [{ ...output, data }] }] })),
    { steps: [{ type: 'model_output', content: [{ type: 'image', uri: 'https://example.invalid/private.png' }] }] },
    { status: 'failed', steps: [{ type: 'model_output', content: [output] }] },
  ])('rejects missing, ambiguous, remote, or malformed output %#', async response => {
    const { adapter } = fixture(response);
    await expect(adapter.enhance(source, prompts.get('handwritten_diary'), new AbortController().signal))
      .rejects.toMatchObject({ code: 'INVALID_AI_OUTPUT' });
  });

  it('rejects decoded output above 20 MiB before allocating decoded bytes', async () => {
    const { adapter } = fixture({ steps: [{ type: 'model_output', content: [{ ...output, data: 'A'.repeat(27_962_032) }] }] });
    await expect(adapter.enhance(source, prompts.get('handwritten_diary'), new AbortController().signal))
      .rejects.toMatchObject({ code: 'PROVIDER_OUTPUT_TOO_LARGE' });
  });

  it('sanitizes provider errors and does not retry', async () => {
    const { create, adapter } = fixture();
    create.mockRejectedValue(new Error('raw provider secret-key source-image-secret'));
    const error = await adapter.enhance(source, prompts.get('handwritten_diary'), new AbortController().signal).catch(error => error);
    expect(error.code).toBe('PROVIDER_FAILURE');
    expect(error.safeMessage).not.toMatch(/raw provider|secret-key|source-image-secret/);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('does not call the SDK after caller cancellation', async () => {
    const { create, adapter } = fixture();
    const controller = new AbortController();
    controller.abort();
    await expect(adapter.enhance(source, prompts.get('handwritten_diary'), controller.signal)).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(create).not.toHaveBeenCalled();
  });

  it('does not deliver an SDK result received after cancellation', async () => {
    const { create, adapter } = fixture();
    const controller = new AbortController();
    create.mockImplementation(async () => {
      controller.abort();
      return { steps: [{ type: 'model_output', content: [output] }] };
    });
    await expect(adapter.enhance(source, prompts.get('handwritten_diary'), controller.signal)).rejects.toMatchObject({ code: 'CANCELLED' });
  });
});
