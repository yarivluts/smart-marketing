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
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { platform } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const dbtProjectDir = join(packageDir, 'dbt');
const venvDir = join(packageDir, '.venv');
const requirementsPath = join(packageDir, 'requirements.txt');
const provisionedMarkerPath = join(venvDir, '.provisioned-hash');
const bigqueryRequirementsPath = join(packageDir, 'requirements-bigquery.txt');
const bigqueryProvisionedMarkerPath = join(venvDir, '.provisioned-bigquery-hash');

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
  if (readFileSync(provisionedMarkerPath, 'utf8').trim() !== requirementsHash()) {
    return false;
  }
  // A cache restore (this package's `.venv` is cached in CI, keyed only on
  // requirements.txt's hash) can bring back a venv whose `bin/python`
  // symlink targets a system interpreter that no longer exists on this
  // runner (e.g. a hosted-tool-cache Python patch bump between the run that
  // populated the cache and this one). `existsSync`/the marker hash both
  // still pass in that case, but the venv is dead: invoking `dbt` fails
  // with ENOENT because its shebang interpreter is missing, not because
  // `dbt` itself is absent. Actually probe that it runs before trusting it.
  const probe = spawnSync(venvDbt, ['--version'], { stdio: 'ignore' });
  return !probe.error && probe.status === 0;
}

/**
 * The interpreter used to create the venv, resolved via PATH rather than a
 * hardcoded location. Debian/Ubuntu (incl. this repo's CI image) ships
 * `python3` but not always a plain `python` alias; Windows installs (and
 * the python.org installer generally) ship `python` but frequently no
 * `python3` at all — trying only the former made `pnpm test` in this
 * package unrunnable on Windows with a bare `spawnSync python3 ENOENT`.
 * Probes both and uses whichever answers, so neither platform needs a
 * manual alias.
 */
function resolvePythonCommand() {
  const candidates = isWindows ? ['python', 'python3'] : ['python3', 'python'];
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ['--version'], { stdio: 'ignore' });
    if (!probe.error && probe.status === 0) {
      return candidate;
    }
  }
  throw new Error(
    `[dbt-transform] no Python interpreter found on PATH (tried: ${candidates.join(', ')}). ` +
      'Install Python 3.11+ and re-run.',
  );
}

function provisionVenv() {
  console.log('[dbt-transform] provisioning a local Python venv with dbt-core + dbt-duckdb...');
  // Wipe any existing (possibly stale/broken — see the interpreter-probe
  // comment in `isAlreadyProvisioned`) venv dir first: `python -m venv` on
  // top of an existing directory doesn't reliably repair broken interpreter
  // symlinks left behind by a corrupted cache restore, so a clean recreate
  // is the only way that's guaranteed to fix it.
  if (existsSync(venvDir)) {
    rmSync(venvDir, { recursive: true, force: true });
  }
  runInherit(resolvePythonCommand(), ['-m', 'venv', venvDir]);
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

function bigqueryRequirementsHash() {
  return createHash('sha256').update(readFileSync(bigqueryRequirementsPath)).digest('hex');
}

function isBigQueryAdapterAlreadyProvisioned() {
  if (!existsSync(bigqueryProvisionedMarkerPath)) {
    return false;
  }
  if (readFileSync(bigqueryProvisionedMarkerPath, 'utf8').trim() !== bigqueryRequirementsHash()) {
    return false;
  }
  // Same "a cache restore can bring back a dead venv" concern
  // `isAlreadyProvisioned` guards against for the base venv — confirm the
  // adapter actually imports before trusting the marker.
  const probe = spawnSync(venvPython, ['-c', 'import dbt.adapters.bigquery'], { stdio: 'ignore' });
  return !probe.error && probe.status === 0;
}

/**
 * Ensures both the base venv (dbt-core + dbt-duckdb) *and* the dbt-bigquery
 * adapter (`requirements-bigquery.txt`) are provisioned into it, installing
 * the latter on top only when it isn't already there. Deliberately kept
 * separate from {@link ensureDbtProvisioned}: `requirements-bigquery.txt` is
 * NOT part of the shared venv every `pnpm build`/`pnpm test` (including CI)
 * provisions — it pulls in a large, GCP-specific dependency tree that only
 * matters once a real BigQuery project is configured (KAN-18) and
 * `run-orchestration.mjs`'s `resolveOrchestrationTarget` actually selects the
 * `prod` target. Callers on the `dev` (DuckDB) path never call this, so
 * CI's provisioning stays exactly as lean as it already was.
 */
export function ensureBigQueryAdapterProvisioned() {
  const paths = ensureDbtProvisioned();
  if (!isBigQueryAdapterAlreadyProvisioned()) {
    console.log('[dbt-transform] provisioning the dbt-bigquery adapter (requirements-bigquery.txt) into the existing venv...');
    runInherit(venvPython, ['-m', 'pip', 'install', '--quiet', '-r', bigqueryRequirementsPath]);
    writeFileSync(bigqueryProvisionedMarkerPath, bigqueryRequirementsHash());
  }
  return paths;
}
