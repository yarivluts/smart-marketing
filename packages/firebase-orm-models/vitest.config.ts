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
    // The emulator suite (models.emulator.test.ts et al.) hits a real local
    // Firestore emulator, which has a confirmed, unresolved upstream bug
    // (firebase/firebase-tools#8654): rapid Listen-stream attach/detach
    // cycles against the emulator can make it echo back a corrupted,
    // wildly-oversized message (observed 100MB-4GB in this repo, garbage
    // relative to the tiny documents these tests write), tripping the
    // client's 4MB RESOURCE_EXHAUSTED limit. Confirmed by direct
    // reproduction that this is NOT concurrency-related (it reproduces just
    // as often with `fileParallelism: false`, i.e. one emulator connection
    // at a time) — every occurrence observed in this repo's tests
    // self-heals via the client SDK's own internal backoff/retry *given
    // enough wall-clock time on that one call*, without needing a whole
    // fresh test attempt. A short testTimeout cuts that self-heal off
    // mid-backoff, and vitest's `retry` then reruns the *test body* (issuing
    // fresh reads/writes, i.e. more attach/detach cycles) rather than
    // waiting out the existing backoff — which can restart the same cycle
    // instead of recovering from it. Verified locally: two consecutive full
    // `pnpm test` runs in this package both hit RESOURCE_EXHAUSTED a dozen+
    // times and both finished 773/773 green once testTimeout was raised
    // enough to let the SDK's own backoff clear inside one attempt, with
    // `retry` cut to 1 as a last-resort safety net (not the primary
    // mechanism) rather than 3 short-lived attempts.
    testTimeout: 120_000,
    hookTimeout: 120_000,
    retry: 1,
  },
});
