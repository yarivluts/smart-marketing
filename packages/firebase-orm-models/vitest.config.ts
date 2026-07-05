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
    // The emulator suite (models.emulator.test.ts) hits a real local Firestore
    // emulator; its client SDK occasionally has to ride out an internal
    // backoff/retry cycle after a transient emulator-connection hiccup, which
    // can take longer than vitest's 5s default. Unit tests in this package
    // finish in single-digit milliseconds regardless, so raising the ceiling
    // costs nothing in the common case.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // The local Firestore emulator's gRPC channel occasionally corrupts a
    // freshly-opened watch stream (a known emulator/client-SDK interaction,
    // not something under this package's control) — surfaces as a bogus
    // RESOURCE_EXHAUSTED error. A same-process retry reliably gets a clean
    // stream on the next attempt; unaffected (unit) tests never fail once,
    // so this never masks a real assertion failure.
    retry: 3,
  },
});
