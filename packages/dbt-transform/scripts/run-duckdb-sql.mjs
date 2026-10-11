#!/usr/bin/env node
// Test harness entry point: runs `run_duckdb_sql.py` with this package's own
// venv interpreter (provisioning the venv first if needed), passing stdin
// through. See that script for the request/response format.
//
// Usage: node scripts/run-duckdb-sql.mjs <outputJsonPath>  (request on stdin)
// Invoked as a subprocess by tests in other packages (e.g.
// @growthos/firebase-orm-models' DuckDB warehouse executor test utility) so
// they can run their SQL on a real engine without an npm-side DuckDB driver.

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { ensureDbtProvisioned } from './dbt-env.mjs';

const { venvPython, packageDir } = ensureDbtProvisioned();
const result = spawnSync(venvPython, [join(packageDir, 'scripts', 'run_duckdb_sql.py'), process.argv[2] ?? ''], { stdio: 'inherit' });
if (result.error) {
  throw result.error;
}
process.exit(result.status ?? 1);
