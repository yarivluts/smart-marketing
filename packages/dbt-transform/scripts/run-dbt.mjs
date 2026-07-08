#!/usr/bin/env node
// Runs this package's dbt project against the buildable-today DuckDB stand-in
// (see dbt/profiles.yml). Self-provisions a local Python virtualenv with the
// pinned dbt-core/dbt-duckdb versions from requirements.txt (see
// `dbt-env.mjs`, also used by `run-orchestration.mjs` — KAN-38) — the same
// "pnpm test just works, no separate CI setup step" posture this repo
// already uses for the Firestore emulator (KAN-22) and Playwright browsers.
//
// Usage: node scripts/run-dbt.mjs <build|test>
//   build -> `dbt parse`  (fast structural/Jinja validation, no execution)
//   test  -> `dbt build`  (seed + run + test against the fixture dataset —
//                          the literal KAN-37 AC: "dbt build green in CI")

import { ensureDbtProvisioned, runInherit } from './dbt-env.mjs';

function main() {
  const mode = process.argv[2];
  if (mode !== 'build' && mode !== 'test') {
    console.error('Usage: node scripts/run-dbt.mjs <build|test>');
    process.exit(1);
  }

  const { venvDbt, dbtProjectDir } = ensureDbtProvisioned();
  const dbtArgs = mode === 'build' ? ['parse'] : ['build', '--target', 'dev'];
  runInherit(venvDbt, dbtArgs, {
    cwd: dbtProjectDir,
    env: { ...process.env, DBT_PROFILES_DIR: dbtProjectDir },
  });
}

main();
