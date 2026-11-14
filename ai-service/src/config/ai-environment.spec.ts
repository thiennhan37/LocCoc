import { validateAiEnvironment } from './ai-environment.js';

describe('validateAiEnvironment', () => {
  const requiredEnvironment = {
    GEMINI_API_KEY: 'test-gemini-key',
    GEMINI_IMAGE_MODEL: 'gemini-3-pro-image-preview',
  };

  it.each([
    [{ GEMINI_IMAGE_MODEL: requiredEnvironment.GEMINI_IMAGE_MODEL }, 'GEMINI_API_KEY'],
    [{ GEMINI_API_KEY: requiredEnvironment.GEMINI_API_KEY }, 'GEMINI_IMAGE_MODEL'],
    [{ ...requiredEnvironment, GEMINI_API_KEY: '' }, 'GEMINI_API_KEY'],
    [{ ...requiredEnvironment, GEMINI_IMAGE_MODEL: '' }, 'GEMINI_IMAGE_MODEL'],
  ])('rejects a missing or empty %s', (input, variable) => {
    expect(() => validateAiEnvironment(input)).toThrow(variable);
  });

  it('applies the AI service defaults to valid provider credentials', () => {
    expect(validateAiEnvironment(requiredEnvironment)).toMatchObject({
      GEMINI_API_KEY: 'test-gemini-key',
      GEMINI_IMAGE_MODEL: 'gemini-3-pro-image-preview',
      AI_SERVICE_PORT: 8082,
      AI_REQUEST_TIMEOUT_MS: 60000,
      AI_MAX_INPUT_BYTES: 10485760,
      AI_MAX_OUTPUT_BYTES: 20971520,
      AI_RATE_LIMIT_MAX: 5,
      AI_RATE_LIMIT_WINDOW_MS: 60000,
    });
  });

  it.each([
    ['AI_REQUEST_TIMEOUT_MS', 60001],
    ['AI_MAX_INPUT_BYTES', 10485761],
  ])('rejects %s above its safety maximum', (variable, value) => {
    expect(() => validateAiEnvironment({ ...requiredEnvironment, [variable]: value })).toThrow(variable);
  });
});
