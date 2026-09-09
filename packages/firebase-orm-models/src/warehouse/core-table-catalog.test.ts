import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BIGQUERY_DISABLED_CORE_TABLES, CORE_TABLE_CATALOG, getCoreTableColumns, isNumericCoreColumnType } from './core-table-catalog';

/** Every `- name:` directly under `models:` in `_core.yml` (two-space indent), without pulling a YAML parser into this package just for a drift guard. */
function coreModelNamesFromDbt(): string[] {
  const yml = readFileSync(resolve(__dirname, '../../../dbt-transform/dbt/models/core/_core.yml'), 'utf8');
  return [...yml.matchAll(/^ {2}- name: (\w+)\s*$/gm)].map((match) => match[1]);
}

describe('CORE_TABLE_CATALOG', () => {
  it('covers every dbt core model declared in _core.yml (or lists it as BigQuery-disabled) so a new model cannot ship without teaching the registry its columns', () => {
    const declared = coreModelNamesFromDbt();
    expect(declared.length).toBeGreaterThan(20);
    const missing = declared.filter((name) => !CORE_TABLE_CATALOG[name] && !BIGQUERY_DISABLED_CORE_TABLES.has(name));
    expect(missing).toEqual([]);
  });

  it('carries the tenant columns on every table (the compiler always predicates on them)', () => {
    for (const [name, columns] of Object.entries(CORE_TABLE_CATALOG)) {
      expect(columns.organization_id, name).toBe('STRING');
      expect(columns.project_id, name).toBe('STRING');
      expect(columns.environment_id, name).toBe('STRING');
    }
  });

  it('answers the two questions registration validation asks', () => {
    expect(getCoreTableColumns('fact_revenue_event')?.amount).toBe('FLOAT64');
    expect(getCoreTableColumns('fact_revenue_event')?.ts).toBe('TIMESTAMP');
    expect(getCoreTableColumns('does_not_exist')).toBeUndefined();
    expect(isNumericCoreColumnType('INT64')).toBe(true);
    expect(isNumericCoreColumnType('FLOAT64')).toBe(true);
    expect(isNumericCoreColumnType('STRING')).toBe(false);
    expect(isNumericCoreColumnType('TIMESTAMP')).toBe(false);
  });
});
