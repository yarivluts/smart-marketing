#!/usr/bin/env node
// Runs this package's dbt project against the buildable-today DuckDB stand-in
// (see dbt/profiles.yml). Self-provisions a local Python virtualenv with the
// pinned dbt-core/dbt-duckdb versions from requirements.txt — the same
// "pnpm test just works, no separate CI setup step" posture this repo
// already uses for the Firestore emulator (KAN-22) and Playwright browsers.
//
// Usage: node scripts/run-dbt.mjs <build|test>
//   build -> `dbt parse`  (fast structural/Jinja validation, no execution)
//   test  -> `dbt build`  (seed + run + test against the fixture dataset —
//                          the literal KAN-37 AC: "dbt build green in CI")

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { platform } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const dbtProjectDir = join(packageDir, 'dbt');
const venvDir = join(packageDir, '.venv');
const requirementsPath = join(packageDir, 'requirements.txt');
const provisionedMarkerPath = join(venvDir, '.provisioned-hash');

const isWindows = platform() === 'win32';
const venvBinDir = join(venvDir, isWindows ? 'Scripts' : 'bin');
const venvPython = join(venvBinDir, isWindows ? 'python.exe' : 'python');
const venvDbt = join(venvBinDir, isWindows ? 'dbt.exe' : 'dbt');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function requirementsHash() {
  return createHash('sha256').update(readFileSync(requirementsPath)).digest('hex');
}

function isAlreadyProvisioned() {
  if (!existsSync(venvDbt) || !existsSync(provisionedMarkerPath)) {
    return false;
  }
  return readFileSync(provisionedMarkerPath, 'utf8').trim() === requirementsHash();
}

function provisionVenv() {
  console.log('[dbt-transform] provisioning a local Python venv with dbt-core + dbt-duckdb...');
  const pythonBin = existsSync('/usr/bin/python3') ? 'python3' : 'python';
  if (!existsSync(venvPython)) {
    run(pythonBin, ['-m', 'venv', venvDir]);
  }
  run(venvPython, ['-m', 'pip', 'install', '--quiet', '--upgrade', 'pip']);
  run(venvPython, ['-m', 'pip', 'install', '--quiet', '-r', requirementsPath]);
  mkdirSync(venvDir, { recursive: true });
  writeFileSync(provisionedMarkerPath, requirementsHash());
}

function main() {
  const mode = process.argv[2];
  if (mode !== 'build' && mode !== 'test') {
    console.error('Usage: node scripts/run-dbt.mjs <build|test>');
    process.exit(1);
  }

  if (!isAlreadyProvisioned()) {
    provisionVenv();
  }

  const dbtArgs = mode === 'build' ? ['parse'] : ['build', '--target', 'dev'];
  run(venvDbt, dbtArgs, {
    cwd: dbtProjectDir,
    env: { ...process.env, DBT_PROFILES_DIR: dbtProjectDir },
  });
}

main();
