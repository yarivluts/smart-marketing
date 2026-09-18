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
    // API route tests are server code and touch the Firestore emulator. Under
    // jsdom they took `ensureFirestoreOrm`'s client-SDK branch — and jsdom does
    // NOT resolve the client SDK's browser build, whatever the old comment
    // there said: `require.resolve('firebase/firestore')` returns
    // `dist/index.cjs.js`, the gRPC build, where `experimentalForceLongPolling`
    // is read and never consulted. So every one of these ran on exactly the
    // transport KAN-103 is about, for as long as it was believed they did not
    // (KAN-165).
    //
    // Running them in `node` makes `typeof window === 'undefined'` true, which
    // routes them through the Admin SDK — no long-lived `Listen` stream, so no
    // framing to corrupt — and, more to the point, the same connection
    // production uses. That was KAN-103's argument everywhere else; this is the
    // corner it never reached.
    //
    // Scoped rather than applied globally: component and hook tests genuinely
    // need a DOM. Every file under these globs was checked for DOM use first —
    // the only match anywhere was `document.cookie` inside an XSS payload
    // string. `lib/orgs` is listed because switching `app/api` alone left the
    // corrupted-stream lines still in the run log while the suite reported
    // 2526 passing: those five files talk to the emulator too, and a green exit
    // code said nothing about them.
    //
    // `lib/firebase/firestore-transport.test.ts` deliberately stays on jsdom —
    // it asserts what jsdom does, so it has to run there.
    environmentMatchGlobs: [
      ['app/api/**/*.test.ts', 'node'],
      ['lib/orgs/**/*.test.ts', 'node'],
    ],
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.test.{ts,tsx}'],
    exclude: ['node_modules', '.next'],
    // These were a mitigation for the corrupted-stream flake described above:
    // a ceiling long enough for the client SDK's internal backoff to clear a hit
    // inside one attempt, with a retry behind it. The emulator-backed tests no
    // longer use that transport, so the mitigation now protects nothing it was
    // written for.
    //
    // Kept anyway, and deliberately: these tests still make real network calls
    // to a local emulator, which is slow under a cold CI runner, and the
    // Playwright suite boots a real Next server. Removing a safety net in the
    // same change that removes its original justification would leave two
    // possible explanations for the next timeout instead of one. Worth revisiting
    // on its own once a few full CI runs have gone by with no corruption in the
    // log — `grep -c GrpcConnection` over a run is the measurement, not a green
    // exit code, which reported 2526 passing while the corruption was still
    // happening (KAN-165).
    testTimeout: 120_000,
    hookTimeout: 120_000,
    retry: 1,
  },
});
