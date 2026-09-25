import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { CompiledMetricQuery } from '@growthos/shared';
import type { WarehouseQueryExecutor, WarehouseRow } from '../warehouse/query-executor';

/**
 * Test-only: runs warehouse SQL on a REAL engine — an in-memory DuckDB inside `@growthos/dbt-transform`'s own
 * venv (`scripts/run-duckdb-sql.mjs`), the same interpreter and `duckdb` package its dbt build uses, so no
 * npm-side DuckDB driver is needed. Every call starts a fresh database, runs `setup` (create + fill the fixture
 * tables), then the queries.
 *
 * Exists because a fake executor can only assert a query's TEXT, and B20's funnel query had the right text
 * and counted the wrong thing. SQL built for this executor must be built for the `duckdb` dialect (it says so
 * via {@link DuckDbWarehouseQueryExecutor.dialect}); BigQuery-style `@name` parameters are rewritten to
 * DuckDB's `$name` form, which is purely a placeholder spelling — values stay bound, never spliced.
 */

const MAX_ROOT_SEARCH_DEPTH = 10;

function resolveDbtTransformDir(): string {
  let dir = process.cwd();
  for (let i = 0; i < MAX_ROOT_SEARCH_DEPTH; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) {
      return join(dir, 'packages', 'dbt-transform');
    }
    const parent = dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return dirname(require.resolve('@growthos/dbt-transform/package.json'));
}

/** The monorepo path of `@growthos/dbt-transform`'s fixture seed — so a DuckDB proof can load the very rows the dbt tests assert against. Forward slashes, since DuckDB takes it inside a SQL string literal. */
export function dbtSeedPath(seedFileName: string): string {
  return join(resolveDbtTransformDir(), 'dbt', 'seeds', seedFileName).replace(/\\/g, '/');
}

/** `@name` → `$name`. Only placeholders start with `@` in this repo's warehouse SQL (JSON paths use `$.`). */
export function toDuckDbPlaceholders(sql: string): string {
  return sql.replace(/@([A-Za-z_][A-Za-z0-9_]*)/g, '$$$1');
}

/** Runs `queries` after `setup` in one fresh in-memory DuckDB; one row list per query. */
export function runDuckDbQueries(setup: readonly string[], queries: readonly CompiledMetricQuery[]): WarehouseRow[][] {
  const dbtTransformDir = resolveDbtTransformDir();
  const outputDir = mkdtempSync(join(tmpdir(), 'growthos-duckdb-'));
  const outputPath = join(outputDir, 'result.json');
  try {
    const request = {
      setup,
      queries: queries.map((query) => ({ sql: toDuckDbPlaceholders(query.sql), params: query.params })),
    };
    const result = spawnSync('node', [join(dbtTransformDir, 'scripts', 'run-duckdb-sql.mjs'), outputPath], {
      cwd: dbtTransformDir,
      input: JSON.stringify(request),
      encoding: 'utf8',
      timeout: 5 * 60_000,
    });
    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0 || !existsSync(outputPath)) {
      throw new Error(`DuckDB harness failed (exit ${String(result.status)}):\n${result.stderr ?? ''}\n${result.stdout ?? ''}`);
    }
    return JSON.parse(readFileSync(outputPath, 'utf8')) as WarehouseRow[][];
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
}

export class DuckDbWarehouseQueryExecutor implements WarehouseQueryExecutor {
  readonly dialect = 'duckdb' as const;
  public readonly calls: CompiledMetricQuery[] = [];

  constructor(private readonly setup: readonly string[]) {}

  execute(query: CompiledMetricQuery): Promise<WarehouseRow[]> {
    this.calls.push(query);
    return Promise.resolve(runDuckDbQueries(this.setup, [query])[0]);
  }
}
