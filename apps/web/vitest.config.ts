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
    // lib/orgs/*.test.ts hit a real local Firestore emulator (KAN-25), same
    // as packages/firebase-orm-models' emulator suite — its client SDK's
    // gRPC channel occasionally corrupts a freshly-opened watch stream
    // (RESOURCE_EXHAUSTED), a known emulator/client-SDK interaction outside
    // this repo's control. Same mitigation as that package's vitest.config.ts:
    // a longer ceiling plus same-process retries reliably ride it out; tests
    // that never hit the emulator finish in milliseconds regardless.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    retry: 3,
  },
});
