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
  },
});
