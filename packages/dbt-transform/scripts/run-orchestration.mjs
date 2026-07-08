#!/usr/bin/env node
// One manually-triggered orchestration run of this package's dbt project for
// a single project (KAN-38, plan `13 §E4.2`: "scheduled runs per project,
// freshness metadata written back"). Re-runs `dbt build` — the exact same
// `dbt build` KAN-37's own `pnpm test` already runs — and then reads the
// resulting `core` tables back, filtered to the requesting org/project, for
// row counts + latest timestamps: the "freshness metadata written back"
// half of the AC. Invoked as a subprocess by
// `packages/firebase-orm-models/src/orchestration/local-dbt-executor.ts`;
// never run directly by a human (the product's own admin UI triggers it
// through that seam).
//
// Usage: node scripts/run-orchestration.mjs <organizationId> <projectId> <outputJsonPath>
//
// Always writes a JSON result to <outputJsonPath>, regardless of outcome, so
// the caller has a structured reason to persist even when the dbt build
// itself fails:
//   success -> {"ok": true, "freshness": [...], "generatedAt": "<ISO 8601>"}
//   failure -> {"ok": false, "errorMessage": "..."}

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ensureDbtProvisioned } from './dbt-env.mjs';

function writeResult(outputPath, result) {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(result));
}

/** The last few lines of captured output — enough to diagnose a failure from the persisted `error_message` without dumping an entire dbt build log into Firestore. */
function tail(text, lines = 20) {
  return text
    .split('\n')
    .filter((line) => line.length > 0)
    .slice(-lines)
    .join('\n');
}

function main() {
  const [organizationId, projectId, outputPath] = process.argv.slice(2);
  if (!organizationId || !projectId || !outputPath) {
    console.error('Usage: node scripts/run-orchestration.mjs <organizationId> <projectId> <outputJsonPath>');
    process.exit(1);
  }

  const { venvPython, venvDbt, dbtProjectDir, packageDir } = ensureDbtProvisioned();
  const duckdbPath = join(dbtProjectDir, 'target', 'growthos_transform.duckdb');

  const build = spawnSync(venvDbt, ['build', '--target', 'dev'], {
    cwd: dbtProjectDir,
    env: { ...process.env, DBT_PROFILES_DIR: dbtProjectDir },
    encoding: 'utf8',
  });
  // Mirror dbt's own logs to this process's stdout/stderr for CI visibility
  // — `run-dbt.mjs` gets this for free via `stdio: 'inherit'`, but this
  // script captures instead of inheriting so a build failure's own output
  // can also be folded into the JSON result written below.
  if (build.stdout) process.stdout.write(build.stdout);
  if (build.stderr) process.stderr.write(build.stderr);

  if (build.error || build.status !== 0) {
    const reason = build.error ? build.error.message : `dbt build exited with code ${build.status}`;
    writeResult(outputPath, { ok: false, errorMessage: `${reason}\n${tail(`${build.stdout ?? ''}\n${build.stderr ?? ''}`)}` });
    process.exit(build.status ?? 1);
  }

  const freshnessOutputPath = `${outputPath}.freshness.json`;
  const read = spawnSync(
    venvPython,
    [join(packageDir, 'scripts', 'read_freshness.py'), duckdbPath, organizationId, projectId, freshnessOutputPath],
    { encoding: 'utf8' },
  );
  if (read.stdout) process.stdout.write(read.stdout);
  if (read.stderr) process.stderr.write(read.stderr);

  if (read.error || read.status !== 0 || !existsSync(freshnessOutputPath)) {
    const reason = read.error ? read.error.message : `freshness read exited with code ${read.status}`;
    writeResult(outputPath, { ok: false, errorMessage: `${reason}\n${tail(`${read.stdout ?? ''}\n${read.stderr ?? ''}`)}` });
    process.exit(read.status ?? 1);
  }

  const freshness = JSON.parse(readFileSync(freshnessOutputPath, 'utf8'));
  writeResult(outputPath, { ok: true, freshness, generatedAt: new Date().toISOString() });
}

main();
