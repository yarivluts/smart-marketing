import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { compileMetricQuery } from './compiler';
import { MetricCompilerError, type MetricQueryRequest } from './types';
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

function expectGolden(caseName: string, request: MetricQueryRequest): void {
  const catalog = buildTestCatalog();
  const compiled = compileMetricQuery(catalog, request);
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
