// Serves the browser SDK from GrowthOS itself: copies @growthos/browser's script-tag bundle to
// public/sdk/v1/growthos.js, the address the install snippet loads. Runs before next build/dev;
// the bundle comes from the package's own build (turbo builds dependencies first).
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let source = '';
try {
  source = require.resolve('@growthos/browser/growthos.js');
} catch {
  // Not built yet: reported below.
}
const target = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sdk', 'v1', 'growthos.js');

if (!source || !existsSync(source)) {
  console.error(`copy-sdk: the @growthos/browser bundle is missing - build @growthos/browser first (pnpm --filter @growthos/browser build).`);
  process.exit(1);
}
mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
console.log(`copy-sdk: served the browser SDK at /sdk/v1/growthos.js`);
