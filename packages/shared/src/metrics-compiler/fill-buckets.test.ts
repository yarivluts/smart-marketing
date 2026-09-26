import { describe, expect, it } from 'vitest';
import { MAX_FILLED_BUCKETS, emptyBucketValueForMetric, fillEmptyBuckets, listBucketDates, truncateToGrain } from './fill-buckets';
import type { CompilerMetricDefinition, MetricCatalog } from './types';

function aggregation(name: string, fn: 'sum' | 'count' | 'count_distinct' | 'avg' | 'min' | 'max'): CompilerMetricDefinition {
  return {
    name,
    definitionKind: 'aggregation',
    aggregation: { function: fn, table: 'fact_funnel_event', column: fn === 'count' ? undefined : 'value', timeColumn: 'occurred_at', filters: [] },
    dimensions: ['channel'],
  };
}

describe('emptyBucketValueForMetric', () => {
  const catalog: MetricCatalog = new Map<string, CompilerMetricDefinition>([
    ['signups', aggregation('signups', 'count')],
    ['visitors', aggregation('visitors', 'count_distinct')],
    ['revenue', aggregation('revenue', 'sum')],
    ['avg_order', aggregation('avg_order', 'avg')],
    ['smallest', aggregation('smallest', 'min')],
    ['largest', aggregation('largest', 'max')],
    ['cac', { name: 'cac', definitionKind: 'formula', formula: 'revenue / signups', dimensions: [] }],
  ]);

  it('count, count_distinct and sum treat an empty bucket as a real zero', () => {
    expect(emptyBucketValueForMetric(catalog, 'signups')).toBe('zero');
    expect(emptyBucketValueForMetric(catalog, 'visitors')).toBe('zero');
    expect(emptyBucketValueForMetric(catalog, 'revenue')).toBe('zero');
  });

  it('avg, min, max and formulas treat an empty bucket as no value', () => {
    expect(emptyBucketValueForMetric(catalog, 'avg_order')).toBe('gap');
    expect(emptyBucketValueForMetric(catalog, 'smallest')).toBe('gap');
    expect(emptyBucketValueForMetric(catalog, 'largest')).toBe('gap');
    expect(emptyBucketValueForMetric(catalog, 'cac')).toBe('gap');
    expect(emptyBucketValueForMetric(catalog, 'unknown')).toBe('gap');
  });
});

describe('truncateToGrain / listBucketDates (BigQuery DATE_TRUNC semantics)', () => {
  it('truncates like BigQuery: weeks start on Sunday', () => {
    // 2026-09-26 is a Saturday; its week starts Sunday 2026-09-20.
    expect(truncateToGrain('2026-09-26', 'week')).toBe('2026-09-20');
    expect(truncateToGrain('2026-09-20', 'week')).toBe('2026-09-20');
    expect(truncateToGrain('2026-09-26', 'month')).toBe('2026-09-01');
    expect(truncateToGrain('2026-11-26', 'quarter')).toBe('2026-10-01');
    expect(truncateToGrain('2026-11-26', 'year')).toBe('2026-01-01');
    expect(truncateToGrain('2026-11-26', 'day')).toBe('2026-11-26');
  });

  it('lists every bucket from the one containing start to the one containing end', () => {
    expect(listBucketDates({ start: '2026-09-19', end: '2026-09-25' }, 'day')).toEqual([
      '2026-09-19',
      '2026-09-20',
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
      '2026-09-24',
      '2026-09-25',
    ]);
    expect(listBucketDates({ start: '2026-09-02', end: '2026-09-26' }, 'week')).toEqual(['2026-08-30', '2026-09-06', '2026-09-13', '2026-09-20']);
    expect(listBucketDates({ start: '2026-01-31', end: '2026-04-01' }, 'month')).toEqual(['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01']);
    expect(listBucketDates({ start: '2025-12-31', end: '2026-01-01' }, 'quarter')).toEqual(['2025-10-01', '2026-01-01']);
    expect(listBucketDates({ start: '2025-12-31', end: '2026-01-01' }, 'year')).toEqual(['2025-01-01', '2026-01-01']);
  });

  it('refuses (null) a range beyond the limit instead of materialising it', () => {
    expect(listBucketDates({ start: '1970-01-01', end: '2026-09-26' }, 'day')).toBeNull();
    expect(listBucketDates({ start: '2026-01-01', end: '2026-01-10' }, 'day', 5)).toBeNull();
    expect(listBucketDates({ start: '2026-01-01', end: '2026-01-05' }, 'day', 5)).toHaveLength(5);
  });
});

describe('fillEmptyBuckets', () => {
  const week = { start: '2026-09-19', end: '2026-09-25', grain: 'day' as const };

  it('fills missing days of a count metric with 0 so the series covers the whole range', () => {
    const rows = [
      { bucket_date: '2026-09-19', signups: 2 },
      { bucket_date: '2026-09-25', signups: 4 },
    ];
    expect(fillEmptyBuckets(rows, { time: week, dimensions: [], metrics: { signups: 'zero' } })).toEqual([
      { bucket_date: '2026-09-19', signups: 2 },
      { bucket_date: '2026-09-20', signups: 0 },
      { bucket_date: '2026-09-21', signups: 0 },
      { bucket_date: '2026-09-22', signups: 0 },
      { bucket_date: '2026-09-23', signups: 0 },
      { bucket_date: '2026-09-24', signups: 0 },
      { bucket_date: '2026-09-25', signups: 4 },
    ]);
  });

  it('fills missing days of an avg/formula metric with null (a gap), never 0', () => {
    const rows = [
      { bucket_date: '2026-09-19', cac: 12.5 },
      { bucket_date: '2026-09-22', cac: 10 },
    ];
    const filled = fillEmptyBuckets(rows, { time: { ...week, end: '2026-09-22' }, dimensions: [], metrics: { cac: 'gap' } });
    expect(filled).toEqual([
      { bucket_date: '2026-09-19', cac: 12.5 },
      { bucket_date: '2026-09-20', cac: null },
      { bucket_date: '2026-09-21', cac: null },
      { bucket_date: '2026-09-22', cac: 10 },
    ]);
  });

  it('a multi-metric query fills each metric by its own rule and zeroes a FULL JOIN null only for zero metrics', () => {
    const rows = [{ bucket_date: '2026-09-19', signups: null, cac: null, revenue: 5 }];
    const filled = fillEmptyBuckets(rows, { time: { ...week, end: '2026-09-20' }, dimensions: [], metrics: { signups: 'zero', cac: 'gap', revenue: 'zero' } });
    expect(filled).toEqual([
      { bucket_date: '2026-09-19', signups: 0, cac: null, revenue: 5 },
      { bucket_date: '2026-09-20', signups: 0, cac: null, revenue: 0 },
    ]);
  });

  it('fills every dimension combination seen, and does not invent unseen ones', () => {
    const rows = [
      { bucket_date: '2026-09-19', channel: 'google', signups: 1 },
      { bucket_date: '2026-09-20', channel: 'meta', signups: 3 },
    ];
    const filled = fillEmptyBuckets(rows, { time: { ...week, end: '2026-09-20' }, dimensions: ['channel'], metrics: { signups: 'zero' } });
    expect(filled).toEqual([
      { bucket_date: '2026-09-19', channel: 'google', signups: 1 },
      { bucket_date: '2026-09-19', channel: 'meta', signups: 0 },
      { bucket_date: '2026-09-20', channel: 'google', signups: 0 },
      { bucket_date: '2026-09-20', channel: 'meta', signups: 3 },
    ]);
  });

  it('fills each compared period over its own window, tagged with its period', () => {
    const rows = [
      { period: 'current', bucket_date: '2026-09-25', signups: 4 },
      { period: 'previous', bucket_date: '2026-09-23', signups: 1 },
    ];
    const filled = fillEmptyBuckets(rows, { time: { start: '2026-09-24', end: '2026-09-25', grain: 'day', compare: 'previous_period' }, dimensions: [], metrics: { signups: 'zero' } });
    expect(filled).toEqual([
      { period: 'current', bucket_date: '2026-09-24', signups: 0 },
      { period: 'current', bucket_date: '2026-09-25', signups: 4 },
      { period: 'previous', bucket_date: '2026-09-22', signups: 0 },
      { period: 'previous', bucket_date: '2026-09-23', signups: 1 },
    ]);
  });

  it('leaves a compared period with no rows at all empty', () => {
    const rows = [{ period: 'current', bucket_date: '2026-09-25', signups: 4 }];
    const filled = fillEmptyBuckets(rows, { time: { start: '2026-09-24', end: '2026-09-25', grain: 'day', compare: 'previous_period' }, dimensions: [], metrics: { signups: 'zero' } });
    expect(filled.every((row) => row.period === 'current')).toBe(true);
    expect(filled).toHaveLength(2);
  });

  it('leaves an entirely empty result empty, so "no data yet" stays distinguishable from zero', () => {
    expect(fillEmptyBuckets([], { time: week, dimensions: [], metrics: { signups: 'zero' } })).toEqual([]);
  });

  it('uses BigQuery week buckets, and matches a timestamp-shaped bucket_date to its day', () => {
    const rows = [{ bucket_date: '2026-09-06T00:00:00.000Z', signups: 2 }];
    const filled = fillEmptyBuckets(rows, { time: { start: '2026-09-02', end: '2026-09-15', grain: 'week' }, dimensions: [], metrics: { signups: 'zero' } });
    expect(filled).toEqual([
      { bucket_date: '2026-08-30', signups: 0 },
      { bucket_date: '2026-09-06T00:00:00.000Z', signups: 2 },
      { bucket_date: '2026-09-13', signups: 0 },
    ]);
  });

  it('returns the rows untouched when the range would need more than MAX_FILLED_BUCKETS buckets', () => {
    const rows = [{ bucket_date: '2026-09-19', signups: 2 }];
    expect(MAX_FILLED_BUCKETS).toBeGreaterThan(366);
    expect(fillEmptyBuckets(rows, { time: { start: '1970-01-01', end: '2026-09-25', grain: 'day' }, dimensions: [], metrics: { signups: 'zero' } })).toEqual(rows);
  });

  it('does not mutate its input', () => {
    const rows = [{ bucket_date: '2026-09-19', signups: null as number | null }];
    fillEmptyBuckets(rows, { time: { ...week, end: '2026-09-19' }, dimensions: [], metrics: { signups: 'zero' } });
    expect(rows[0].signups).toBeNull();
  });
});
