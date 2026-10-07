export interface AiEnvironment {
  GEMINI_API_KEY: string;
  GEMINI_IMAGE_MODEL: string;
  AI_SERVICE_PORT: number;
  AI_REQUEST_TIMEOUT_MS: number;
  AI_MAX_INPUT_BYTES: number;
  AI_MAX_OUTPUT_BYTES: number;
  AI_RATE_LIMIT_MAX: number;
  AI_RATE_LIMIT_WINDOW_MS: number;
}

const MAX_REQUEST_TIMEOUT_MS = 60000;
const MAX_INPUT_BYTES = 10485760;
const MAX_OUTPUT_BYTES = 20971520;

export function validateAiEnvironment(input: Record<string, unknown>): AiEnvironment {
  return {
    GEMINI_API_KEY: requiredString(input, 'GEMINI_API_KEY'),
    GEMINI_IMAGE_MODEL: requiredString(input, 'GEMINI_IMAGE_MODEL'),
    AI_SERVICE_PORT: positiveInteger(input, 'AI_SERVICE_PORT', 8082, 65535),
    AI_REQUEST_TIMEOUT_MS: positiveInteger(input, 'AI_REQUEST_TIMEOUT_MS', MAX_REQUEST_TIMEOUT_MS, MAX_REQUEST_TIMEOUT_MS),
    AI_MAX_INPUT_BYTES: positiveInteger(input, 'AI_MAX_INPUT_BYTES', MAX_INPUT_BYTES, MAX_INPUT_BYTES),
    AI_MAX_OUTPUT_BYTES: positiveInteger(input, 'AI_MAX_OUTPUT_BYTES', MAX_OUTPUT_BYTES, MAX_OUTPUT_BYTES),
    AI_RATE_LIMIT_MAX: positiveInteger(input, 'AI_RATE_LIMIT_MAX', 5),
    AI_RATE_LIMIT_WINDOW_MS: positiveInteger(input, 'AI_RATE_LIMIT_WINDOW_MS', 60000),
  };
}

function requiredString(input: Record<string, unknown>, name: keyof AiEnvironment): string {
  const value = input[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Invalid AI environment: ${name} is required`);
  }
  return value;
}

function positiveInteger(
  input: Record<string, unknown>,
  name: keyof AiEnvironment,
  defaultValue: number,
  maximum?: number,
): number {
  const rawValue = input[name];
  if (rawValue === undefined || rawValue === '') return defaultValue;

  const value = typeof rawValue === 'number' ? rawValue : Number(rawValue);
  if (!Number.isInteger(value) || value <= 0 || (maximum !== undefined && value > maximum)) {
    throw new Error(`Invalid AI environment: ${name} must be a positive integer${maximum ? ` no greater than ${maximum}` : ''}`);
  }
  return value;
}
