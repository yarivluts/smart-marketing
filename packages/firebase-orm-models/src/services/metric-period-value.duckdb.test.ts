import { describe, expect, it } from 'vitest';
import { compileMetricQuery, type CompiledMetricQuery, type CompilerMetricDefinition, type MetricCatalog, type MetricQueryRequest } from '@growthos/shared';
import { runDuckDbQueries } from '../test-utils/duckdb-warehouse-executor';

/**
 * B24: a ratio's period value, proven on a REAL engine.
 *
 * The compiler's own SQL - the text production sends to BigQuery - runs here against an in-memory
 * DuckDB, rewritten only where the two dialects spell the same thing differently (backtick vs.
 * double-quote identifiers, `DATE_TRUNC(x, DAY)` vs. `date_trunc('day', x)`, BigQuery's built-in
 * `SAFE_DIVIDE` as a macro). The fixture is the reported case: day 1 has 1 conversion from 1 visitor
 * (100%), day 2 has 1 conversion from 100 visitors (1%). The true rate for the two days is 2/101 =
 * 1.98%; the mean of the two daily rates - what a big-number tile used to show - is 50.5%.
 */

const catalog: MetricCatalog = new Map<string, CompilerMetricDefinition>([
  [
    'lp_visitors',
    {
      name: 'lp_visitors',
      definitionKind: 'aggregation',
      aggregation: { function: 'count', table: 'fact_funnel_event', timeColumn: 'ts', filters: [{ field: 'step', operator: '=', value: 'lp_visit' }] },
      dimensions: ['campaign'],
    },
  ],
  [
    'lp_conversions',
    {
      name: 'lp_conversions',
      definitionKind: 'aggregation',
      aggregation: { function: 'count', table: 'fact_funnel_event', timeColumn: 'ts', filters: [{ field: 'step', operator: '=', value: 'lp_conversion' }] },
      dimensions: ['campaign'],
    },
  ],
  ['lp_conversion_rate', { name: 'lp_conversion_rate', definitionKind: 'formula', formula: 'lp_conversions / lp_visitors', dimensions: ['campaign'] }],
  [
    'visiting_customers',
    {
      name: 'visiting_customers',
      definitionKind: 'aggregation',
      aggregation: { function: 'count_distinct', table: 'fact_funnel_event', column: 'customer_id', timeColumn: 'ts', filters: [{ field: 'step', operator: '=', value: 'lp_visit' }] },
      dimensions: ['campaign'],
    },
  ],
]);

function eventRows(date: string, step: string, count: number, campaign: string, customerId: (index: number) => string): string[] {
  return Array.from({ length: count }, (_, index) => `(TIMESTAMP '${date} 10:00:00', '${step}', '${campaign}', '${customerId(index)}')`);
}

const SETUP = [
  'CREATE MACRO SAFE_DIVIDE(a, b) AS CASE WHEN b = 0 THEN NULL ELSE a / b END',
  'CREATE TABLE fact_funnel_event (ts TIMESTAMP, step VARCHAR, campaign VARCHAR, customer_id VARCHAR)',
  `INSERT INTO fact_funnel_event VALUES ${[
    // Day 1: 1/1 = 100%. The visitor is customer c0, who comes back on day 2.
    ...eventRows('2026-09-01', 'lp_visit', 1, 'spring', () => 'c0'),
    ...eventRows('2026-09-01', 'lp_conversion', 1, 'spring', () => 'c0'),
    // Day 2: 1/100 = 1%.
    ...eventRows('2026-09-02', 'lp_visit', 100, 'spring', (index) => `c${index}`),
    ...eventRows('2026-09-02', 'lp_conversion', 1, 'spring', () => 'c7'),
  ].join(', ')}`,
];

/** The dialect-only differences between the compiler's BigQuery SQL and DuckDB - never a change to what it computes. */
function toDuckDbDialect(query: CompiledMetricQuery): CompiledMetricQuery {
  const sql = query.sql
    .replace(/`/g, '"')
    .replace(/DATE_TRUNC\((DATE\("[a-z_]+"\)), (DAY|WEEK|MONTH|QUARTER|YEAR)\)/g, (_match, expression: string, part: string) => `CAST(date_trunc('${part.toLowerCase()}', ${expression}) AS DATE)`)
    // DuckDB compares a DATE to a bound VARCHAR only through an explicit cast.
    .replace(/(DATE\("[a-z_]+"\)) (>=|<=) @(time_(?:start|end)_(?:current|previous))/g, '$1 $2 CAST(@$3 AS DATE)');
  return { sql, params: query.params };
}

/** Runs each request's compiled SQL in one fresh DuckDB (one harness start for all of them). */
function run(...requests: MetricQueryRequest[]): Record<string, unknown>[][] {
  return runDuckDbQueries(
    SETUP,
    requests.map((request) => toDuckDbDialect(compileMetricQuery(catalog, request))),
  );
}

const TWO_DAYS = { start: '2026-09-01', end: '2026-09-02' };

describe('a ratio metric\'s period value on a real SQL engine (B24)', () => {
  it('the whole-range (total grain) query evaluates the formula over the period totals: 2/101 = 1.98%, NOT the 50.5% mean of the daily rates', () => {
    const [rows] = run({ metrics: ['lp_conversion_rate'], time: { ...TWO_DAYS, grain: 'total' } });

    expect(rows).toHaveLength(1);
    const periodValue = Number(rows[0].lp_conversion_rate);
    expect(periodValue).toBeCloseTo(2 / 101, 10);
    expect(periodValue).toBeCloseTo(0.0198, 4);
    expect(periodValue).not.toBeCloseTo(0.505, 2);
    expect(String(rows[0].bucket_date)).toBe('2026-09-01');
  });

  it('the day-grain series really is 100% then 1% - the input the old average-of-ratios turned into 50.5%', () => {
    const [rows] = run({ metrics: ['lp_conversion_rate'], time: { ...TWO_DAYS, grain: 'day' } });

    const daily = rows.map((row) => Number(row.lp_conversion_rate));
    expect(daily).toEqual([1, 0.01]);
    expect((daily[0] + daily[1]) / 2).toBeCloseTo(0.505, 10);
  });

  it('a compared previous period gets its own period value, and an empty window returns no row at all (not a measured 0)', () => {
    const [rows] = run({ metrics: ['lp_conversion_rate'], time: { ...TWO_DAYS, grain: 'total', compare: 'previous_period' } });

    expect(rows.map((row) => row.period)).toEqual(['current']);
    expect(Number(rows[0].lp_conversion_rate)).toBeCloseTo(2 / 101, 10);
  });

  it('a breakdown yields one period value per dimension value', () => {
    const [rows] = run({ metrics: ['lp_conversion_rate'], dimensions: ['campaign'], time: { ...TWO_DAYS, grain: 'total' } });

    expect(rows).toHaveLength(1);
    expect(rows[0].campaign).toBe('spring');
    expect(Number(rows[0].lp_conversion_rate)).toBeCloseTo(2 / 101, 10);
  });

  it('a count is unchanged: the whole-range value equals the sum of the daily values', () => {
    const [total, daily] = run({ metrics: ['lp_visitors'], time: { ...TWO_DAYS, grain: 'total' } }, { metrics: ['lp_visitors'], time: { ...TWO_DAYS, grain: 'day' } });

    expect(Number(total[0].lp_visitors)).toBe(101);
    expect(daily.reduce((sum, row) => sum + Number(row.lp_visitors), 0)).toBe(101);
  });

  it('a count_distinct over the period counts a customer seen on both days once - the daily values would sum to one more', () => {
    const [total, daily] = run(
      { metrics: ['visiting_customers'], time: { ...TWO_DAYS, grain: 'total' } },
      { metrics: ['visiting_customers'], time: { ...TWO_DAYS, grain: 'day' } },
    );

    // c0 visits on both days; days hold {c0} and {c0..c99}.
    expect(Number(total[0].visiting_customers)).toBe(100);
    expect(daily.reduce((sum, row) => sum + Number(row.visiting_customers), 0)).toBe(101);
  });
});
