// Serves the SDKs from GrowthOS itself, under /sdk/v1/:
//   growthos.js            - @growthos/browser's script-tag bundle (what the install snippet loads)
//   growthos-browser.tgz   - npm install https://<app>/sdk/v1/growthos-browser.tgz
//   growthos-node.tgz      - npm install https://<app>/sdk/v1/growthos-node.tgz
// Runs before next build/dev; the packages are built first (turbo builds dependencies first). The
// tarballs are what `pnpm pack` publishes, so installing from here equals installing from npm.
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, '..', 'public', 'sdk', 'v1');
const packages = join(here, '..', '..', '..', 'packages');

let bundle = '';
try {
  bundle = require.resolve('@growthos/browser/growthos.js');
} catch {
  // Not built yet: reported below.
}
if (!bundle || !existsSync(bundle)) {
  console.error(
    'copy-sdk: the @growthos/browser bundle is missing - build @growthos/browser first (pnpm --filter @growthos/browser build).',
  );
  process.exit(1);
}
mkdirSync(target, { recursive: true });
copyFileSync(bundle, join(target, 'growthos.js'));

/** Packs one SDK package into public/sdk/v1/<name>.tgz (a stable name, whatever the version). */
function pack(directory, name) {
  // pnpm pack happily packs a package that was never built (package.json + README only), which
  // would serve an SDK with no code - so its entry point must exist first.
  const packageDir = join(packages, directory);
  const { main } = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));
  if (!main || !existsSync(join(packageDir, main))) {
    console.error(
      `copy-sdk: ${directory} is not built (${main ?? 'no main'} is missing) - add it as a dependency of @growthos/web so it builds first.`,
    );
    process.exit(1);
  }
  const work = join(target, `.pack-${name}`);
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  execFileSync('pnpm', ['pack', '--pack-destination', work], {
    cwd: packageDir,
    stdio: 'ignore',
    shell: process.platform === 'win32',
  });
  const tarball = readdirSync(work).find((file) => file.endsWith('.tgz'));
  if (!tarball) throw new Error(`copy-sdk: pnpm pack produced nothing for ${directory}`);
  renameSync(join(work, tarball), join(target, `${name}.tgz`));
  rmSync(work, { recursive: true, force: true });
}

pack('sdk-browser', 'growthos-browser');
pack('sdk-node', 'growthos-node');
console.log(
  'copy-sdk: served the SDKs at /sdk/v1/ (growthos.js, growthos-browser.tgz, growthos-node.tgz)',
);
