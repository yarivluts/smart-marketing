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
    // as packages/firebase-orm-models' emulator suite — a confirmed,
    // unresolved upstream bug (firebase/firebase-tools#8654) where rapid
    // Listen-stream attach/detach cycles against the emulator can make it
    // echo back a corrupted, wildly-oversized message, tripping the client
    // SDK's 4MB RESOURCE_EXHAUSTED limit. Every occurrence self-heals via
    // the client SDK's own internal backoff given enough wall-clock time on
    // that one call; a short testTimeout cuts that off mid-backoff, and
    // retrying reruns the test body (more attach/detach cycles) instead of
    // waiting out the existing backoff. Same fix as that package's
    // vitest.config.ts, verified there against repeated full-suite runs:
    // a long enough ceiling to let a hit clear inside one attempt, with
    // retry as a last-resort safety net rather than the primary mechanism.
    testTimeout: 120_000,
    hookTimeout: 120_000,
    retry: 1,
  },
});
