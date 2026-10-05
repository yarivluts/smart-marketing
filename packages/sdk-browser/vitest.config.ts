import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@growthos/touchpoint-capture': fileURLToPath(new URL('../shared/src/touchpoint-capture/index.ts', import.meta.url)) } },
  test: { environment: 'jsdom', environmentOptions: { jsdom: { url: 'https://www.easysign.example/pricing?utm_source=google&utm_medium=cpc&utm_campaign=lawyers&gclid=abc' } } },
});
