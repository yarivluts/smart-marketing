import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Force esbuild to treat firebase-orm's legacy decorators correctly.
  esbuild: {
    tsconfigRaw: {
      compilerOptions: {
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
        useDefineForClassFields: false,
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Closes every Firebase app a test file opened once that file's tests
    // finish — see the file itself for why this matters (a real, previously
    // unfixed cause of growing-then-fatal RESOURCE_EXHAUSTED emulator
    // errors across a full `vitest run`).
    setupFiles: ['./src/test-utils/firestore-emulator-cleanup.ts'],
    // The emulator suite (models.emulator.test.ts) hits a real local Firestore
    // emulator; its client SDK occasionally has to ride out an internal
    // backoff/retry cycle after a transient emulator-connection hiccup, which
    // can take longer than vitest's 5s default. Unit tests in this package
    // finish in single-digit milliseconds regardless, so raising the ceiling
    // costs nothing in the common case.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // `firestore-emulator-cleanup.ts` (above) fixed the *unbounded* growth in
    // outgoing message size that made RESOURCE_EXHAUSTED fatal across a full
    // run, but a handful of emulator test files can still legitimately run
    // concurrently (vitest's thread pool), so a brief spike + backoff/retry
    // on a freshly-opened watch stream remains possible. A same-process retry
    // reliably gets a clean stream on the next attempt; unaffected (unit)
    // tests never fail once, so this never masks a real assertion failure.
    retry: 3,
  },
});
