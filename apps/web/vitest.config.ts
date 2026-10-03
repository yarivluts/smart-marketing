import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import * as net from 'node:net';

function isPortOpen(host: string, port: number, timeoutMs = 150): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port, timeout: timeoutMs });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

export default defineConfig(async () => {
  const hasFirestoreEmulator = await isPortOpen('127.0.0.1', 8090);

  if (!hasFirestoreEmulator) {
    console.warn(
      '\n[vitest] Firestore emulator not detected on 127.0.0.1:8090. ' +
        'Running unit/component test suites (excluding emulator-dependent API route suites). ' +
        'To run all suites with the emulator, use "pnpm run test:unit:emulator".\n'
    );
  }

  return {
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
      include: [
        'components/**/*.test.{ts,tsx}',
        'lib/**/*.test.{ts,tsx}',
        'messages/**/*.test.{ts,tsx}',
        'tests/**/*.test.{ts,tsx}',
        'app/*.test.{ts,tsx}',
        'app/api/**/mock-event*/**/*.test.{ts,tsx}',
        'app/api/**/mock-event*.test.{ts,tsx}',
        'app/api/**/setup-checklist*/**/*.test.{ts,tsx}',
        'app/api/**/setup-checklist*.test.{ts,tsx}',
        'app/api/**/copilot*/**/*.test.{ts,tsx}',
        'app/api/**/copilot*.test.{ts,tsx}',
        ...(hasFirestoreEmulator ? ['app/api/**/*.test.{ts,tsx}'] : []),
      ],
      exclude: [
        'node_modules',
        '.next',
        ...(hasFirestoreEmulator
          ? []
          : [
              'lib/orgs/isolation.test.ts',
              'lib/orgs/queries.test.ts',
              'lib/orgs/session-context.test.ts',
              'lib/orgs/tv-viewer-isolation.test.ts',
              'lib/orgs/win-feed-stream.test.ts',
            ]),
      ],
      testTimeout: hasFirestoreEmulator ? 120_000 : 15_000,
      hookTimeout: hasFirestoreEmulator ? 120_000 : 15_000,
      retry: hasFirestoreEmulator ? 1 : 0,
    },
  };
});
