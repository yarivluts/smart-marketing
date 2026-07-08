// Shared local-Python-venv provisioning for this package's dbt project
// (KAN-37/KAN-38): self-provisions dbt-core/dbt-duckdb from
// requirements.txt on first use, the same "pnpm test just works, no
// separate CI setup step" posture this repo already uses for the Firestore
// emulator (KAN-22) and Playwright browsers. Used by both `run-dbt.mjs`
// (KAN-37's own build/test tasks) and `run-orchestration.mjs` (KAN-38's
// manually-triggered orchestration run), so the provisioning logic lives in
// exactly one place instead of being duplicated across both entry points.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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

/** Runs a command with inherited stdio, exiting this process on failure — for callers that have nothing useful left to do once the command fails. */
export function runInherit(command, args, options = {}) {
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
  if (!existsSync(venvPython)) {
    // Resolved via PATH, not a hardcoded location — Debian/Ubuntu (incl. this
    // repo's CI image) ships `python3` but not always a plain `python` alias.
    runInherit('python3', ['-m', 'venv', venvDir]);
  }
  runInherit(venvPython, ['-m', 'pip', 'install', '--quiet', '--upgrade', 'pip']);
  runInherit(venvPython, ['-m', 'pip', 'install', '--quiet', '-r', requirementsPath]);
  writeFileSync(provisionedMarkerPath, requirementsHash());
}

/**
 * Ensures the venv exists (provisioning it if needed, or if `requirements.txt`
 * changed since it was last provisioned) and returns its interpreter/dbt
 * binary paths plus the dbt project directory.
 */
export function ensureDbtProvisioned() {
  if (!isAlreadyProvisioned()) {
    provisionVenv();
  }
  return { venvPython, venvDbt, dbtProjectDir, packageDir };
}
