import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    env: {
      GEMINI_API_KEY: 'test-key',
      GEMINI_IMAGE_MODEL: 'test-model',
      AI_REQUEST_TIMEOUT_MS: '60000',
    },
  },
});
