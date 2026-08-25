import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { compileMetricQuery } from './compiler';
import { MetricCompilerError, type CompilerTenant, type MetricQueryRequest } from './types';
import { buildTestCatalog } from './__fixtures__/test-catalog';

/**
 * Golden-file SQL tests (KAN-41 AC: "golden-file SQL tests for 10
 * representative queries"). Each case's expected BigQuery SQL + bind
 * params live in `__fixtures__/<case>.sql` / `<case>.params.json` — real,
 * readable, checked-in files rather than inline template strings, so a
 * deliberate compiler change shows up as an obvious diff in review.
 */

const fixturesDir = path.join(process.cwd(), 'src/metrics-compiler/__fixtures__');

function loadGolden(caseName: string): { sql: string; params: Record<string, unknown> } {
  const sql = readFileSync(path.join(fixturesDir, `${caseName}.sql`), 'utf8').trimEnd();
  const params = JSON.parse(readFileSync(path.join(fixturesDir, `${caseName}.params.json`), 'utf8')) as Record<string, unknown>;
  return { sql, params };
}

function expectGolden(caseName: string, request: MetricQueryRequest, tenant?: CompilerTenant): void {
  const catalog = buildTestCatalog();
  const compiled = compileMetricQuery(catalog, request, tenant);
  const golden = loadGolden(caseName);
  expect(compiled.sql).toBe(golden.sql);
  expect(compiled.params).toEqual(golden.params);
}

describe('compileMetricQuery — golden-file SQL tests', () => {
  it('01: simple aggregation, no dimensions, day grain', () => {
    expectGolden('01-simple-aggregation-day', {
      metrics: ['ad_spend'],
      time: { start: '2026-01-01', end: '2026-01-07', grain: 'day' },
    });
  });

  it('02: aggregation broken down by one dimension, week grain', () => {
    expectGolden('02-aggregation-with-dimension-week', {
      metrics: ['ad_spend'],
      dimensions: ['channel'],
      time: { start: '2026-01-01', end: '2026-01-31', grain: 'week' },
    });
  });

  it('03: aggregation with a base filter and a query-level filter, month grain', () => {
    expectGolden('03-aggregation-with-filters-month', {
      metrics: ['signups'],
      dimensions: ['geo'],
      filters: [{ field: 'geo', operator: '=', value: 'IL' }],
      time: { start: '2026-01-01', end: '2026-03-31', grain: 'month' },
    });
  });

  it('04: single-level formula, no dimensions, month grain', () => {
    expectGolden('04-formula-cost-per-signup-month', {
      metrics: ['cost_per_signup'],
      time: { start: '2026-01-01', end: '2026-01-31', grain: 'month' },
    });
  });

  it('05: single-level formula broken down by a dimension, week grain', () => {
    expectGolden('05-formula-with-dimension-breakdown', {
      metrics: ['cac'],
      dimensions: ['channel'],
      time: { start: '2026-02-01', end: '2026-02-28', grain: 'week' },
    });
  });

  it('06: multi-level formula (3 levels deep), quarter grain', () => {
    expectGolden('06-multi-level-formula', {
      metrics: ['ltv_to_cac'],
      time: { start: '2026-01-01', end: '2026-12-31', grain: 'quarter' },
    });
  });

  it('07: compare previous_period, with a dimension breakdown', () => {
    expectGolden('07-compare-previous-period', {
      metrics: ['ad_spend'],
      dimensions: ['channel'],
      time: { start: '2026-03-01', end: '2026-03-14', grain: 'week', compare: 'previous_period' },
    });
  });

  it('08: compare previous_year', () => {
    expectGolden('08-compare-previous-year', {
      metrics: ['signups'],
      time: { start: '2026-01-01', end: '2026-01-31', grain: 'month', compare: 'previous_year' },
    });
  });

  it('09: multiple top-level metrics in one request', () => {
    expectGolden('09-multi-metric-request', {
      metrics: ['ad_spend', 'new_paying'],
      dimensions: ['channel'],
      time: { start: '2026-04-01', end: '2026-04-02', grain: 'day' },
    });
  });

  it('10: count() with no column + an "in" filter compiled to IN UNNEST', () => {
    expectGolden('10-count-function-in-filter', {
      metrics: ['orders'],
      filters: [{ field: 'channel', operator: 'in', value: 'google,meta,tiktok' }],
      time: { start: '2026-05-01', end: '2026-05-01', grain: 'day' },
    });
  });

  it('11: a tenant compiles an organization_id + project_id predicate into the leaf CTE (KAN-18 tenant-isolation fix — a shared BigQuery warehouse must never sum another tenant\'s rows in)', () => {
    expectGolden(
      '11-tenant-scoped-simple-aggregation-day',
      { metrics: ['ad_spend'], time: { start: '2026-01-01', end: '2026-01-07', grain: 'day' } },
      { organizationId: 'org-1', projectId: 'project-1' },
    );
  });

  it('12: the tenant predicate is compiled into every leaf CTE of a multi-metric request, not just the first', () => {
    expectGolden(
      '12-tenant-scoped-multi-metric-request',
      { metrics: ['ad_spend', 'new_paying'], dimensions: ['channel'], time: { start: '2026-04-01', end: '2026-04-02', grain: 'day' } },
      { organizationId: 'org-1', projectId: 'project-1' },
    );
  });

  it('13: a tenant with environmentId also compiles an environment_id predicate — a project holding both test- and live-mode ingest keys must never blend the two in one number', () => {
    expectGolden(
      '13-tenant-environment-scoped-aggregation-day',
      { metrics: ['ad_spend'], time: { start: '2026-01-01', end: '2026-01-07', grain: 'day' } },
      { organizationId: 'org-1', projectId: 'project-1', environmentId: 'env-prod-1' },
    );
  });

  it('14: a formula using the max() function compiles to BigQuery\'s GREATEST(), broken down by a dimension, day grain', () => {
    expectGolden('14-formula-with-max-function', {
      metrics: ['floored_net_spend'],
      dimensions: ['channel'],
      time: { start: '2026-06-01', end: '2026-06-01', grain: 'day' },
    });
  });
});

describe('compileMetricQuery — formula max()/min() functions', () => {
  // Golden-file case 14 above covers max() end to end; this covers min()
  // compiling to LEAST() without needing a second full fixture pair.
  it('compiles min() to BigQuery\'s LEAST()', () => {
    const catalog = new Map(buildTestCatalog());
    catalog.set('capped_new_paying', { name: 'capped_new_paying', definitionKind: 'formula', formula: 'min(new_paying, ad_spend)', dimensions: [] });
    const compiled = compileMetricQuery(catalog, {
      metrics: ['capped_new_paying'],
      time: { start: '2026-01-01', end: '2026-01-01', grain: 'day' },
    });
    expect(compiled.sql).toContain('LEAST(value_new_paying, value_ad_spend) AS `capped_new_paying`');
  });

  it('compiles a 3-argument max() call with all arguments joined by commas', () => {
    const catalog = new Map(buildTestCatalog());
    catalog.set('best_of_three', { name: 'best_of_three', definitionKind: 'formula', formula: 'max(ad_spend, new_paying, 0)', dimensions: [] });
    const compiled = compileMetricQuery(catalog, {
      metrics: ['best_of_three'],
      time: { start: '2026-01-01', end: '2026-01-01', grain: 'day' },
    });
    expect(compiled.sql).toContain('GREATEST(value_ad_spend, value_new_paying, 0) AS `best_of_three`');
  });
});

describe('compileMetricQuery — inclusive time-range semantics', () => {
  // Regression: `end` is documented inclusive (YYYY-MM-DD). The compiler never knows a
  // time column's SQL type, so a bare `ts <= '2026-01-31'` on a TIMESTAMP column coerces
  // the bound to midnight and silently drops that final day's later rows. The predicate
  // must normalize the column with DATE(), exactly as the bucketing expression does.
  it('normalizes the time column with DATE() in the range predicate so the inclusive end day is kept for a timestamp column', () => {
    const catalog = buildTestCatalog();
    // `signups` aggregates `fact_funnel_event` on the `ts` timestamp column.
    const compiled = compileMetricQuery(catalog, {
      metrics: ['signups'],
      time: { start: '2026-01-01', end: '2026-01-31', grain: 'month' },
    });
    expect(compiled.sql).toContain('WHERE DATE(`ts`) >= @time_start_current AND DATE(`ts`) <= @time_end_current');
    // The naive, buggy predicate must not survive.
    expect(compiled.sql).not.toContain('`ts` >= @time_start_current');
    expect(compiled.sql).not.toContain('`ts` <= @time_end_current');
    expect(compiled.params.time_end_current).toBe('2026-01-31');
  });

  it('applies the same DATE() normalization to a compare window predicate', () => {
    const catalog = buildTestCatalog();
    const compiled = compileMetricQuery(catalog, {
      metrics: ['signups'],
      time: { start: '2026-01-01', end: '2026-01-31', grain: 'month', compare: 'previous_year' },
    });
    expect(compiled.sql).toContain('DATE(`ts`) >= @time_start_previous AND DATE(`ts`) <= @time_end_previous');
  });
});

describe('compileMetricQuery — error handling', () => {
  it('rejects an unknown metric name', () => {
    const catalog = buildTestCatalog();
    expect(() => compileMetricQuery(catalog, { metrics: ['does_not_exist'], time: { start: '2026-01-01', end: '2026-01-01', grain: 'day' } })).toThrow(
      MetricCompilerError,
    );
  });

  it('rejects a dimension the requested metric does not declare', () => {
    const catalog = buildTestCatalog();
    expect(() =>
      compileMetricQuery(catalog, { metrics: ['ad_spend'], dimensions: ['plan'], time: { start: '2026-01-01', end: '2026-01-01', grain: 'day' } }),
    ).toThrow(MetricCompilerError);
  });

  it('rejects an end date before the start date', () => {
    const catalog = buildTestCatalog();
    expect(() => compileMetricQuery(catalog, { metrics: ['ad_spend'], time: { start: '2026-02-01', end: '2026-01-01', grain: 'day' } })).toThrow(
      MetricCompilerError,
    );
  });

  it('detects a formula reference cycle even in a hand-built catalog the registry never validated', () => {
    const catalog = new Map(buildTestCatalog());
    catalog.set('cyclic_a', { name: 'cyclic_a', definitionKind: 'formula', formula: 'cyclic_b + 1', dimensions: [] });
    catalog.set('cyclic_b', { name: 'cyclic_b', definitionKind: 'formula', formula: 'cyclic_a + 1', dimensions: [] });
    expect(() => compileMetricQuery(catalog, { metrics: ['cyclic_a'], time: { start: '2026-01-01', end: '2026-01-01', grain: 'day' } })).toThrow(
      MetricCompilerError,
    );
  });

  it('rejects a filter operator outside the known vocabulary instead of splicing it into SQL (KAN-42: a query request is now externally reachable, not just a hand-built catalog)', () => {
    const catalog = buildTestCatalog();
    const request = {
      metrics: ['ad_spend'],
      filters: [{ field: 'channel', operator: '1=1; --', value: 'google' }],
      time: { start: '2026-01-01', end: '2026-01-01', grain: 'day' },
      // deliberately bypassing the TS union to simulate untrusted input a caller other than `apps/api`'s own HTTP boundary check might pass straight through
    } as unknown as Parameters<typeof compileMetricQuery>[1];
    expect(() => compileMetricQuery(catalog, request)).toThrow(MetricCompilerError);
  });
});
