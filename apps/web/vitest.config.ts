import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
      'server-only': fileURLToPath(new URL('./test-utils/next-boundary-stub.ts', import.meta.url)),
      'client-only': fileURLToPath(new URL('./test-utils/next-boundary-stub.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.test.{ts,tsx}'],
    exclude: ['node_modules', '.next'],
    watch: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    teardownTimeout: 3000,
    retry: 0,
  },
});
