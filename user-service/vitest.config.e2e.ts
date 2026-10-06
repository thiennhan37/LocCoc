import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    env: { NODE_ENV: 'test' },
    include: ['**/*.e2e-spec.ts'],
  },
});
