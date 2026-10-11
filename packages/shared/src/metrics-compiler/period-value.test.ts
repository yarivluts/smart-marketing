import { describe, expect, it } from 'vitest';
import { buildTestCatalog } from './__fixtures__/test-catalog';
import { metricAccumulatesOverPeriod, readPeriodValue } from './period-value';
import type { CompilerMetricDefinition, MetricCatalog } from './types';

describe('readPeriodValue', () => {
  it('reads the single current row of an uncompared total-grain result', () => {
    expect(readPeriodValue([{ bucket_date: '2026-09-01', lp_conversion_rate: 2 / 101 }], 'lp_conversion_rate')).toBeCloseTo(0.0198, 4);
  });

  it('picks the requested period of a compared result', () => {
    const rows = [
      { period: 'current', bucket_date: '2026-09-01', signups: 12 },
      { period: 'previous', bucket_date: '2026-08-30', signups: '8' },
    ];
    expect(readPeriodValue(rows, 'signups', 'current')).toBe(12);
    expect(readPeriodValue(rows, 'signups', 'previous')).toBe(8);
  });

  it('is null - not 0 - when the period returned no row or no value', () => {
    expect(readPeriodValue([], 'signups')).toBeNull();
    expect(readPeriodValue([{ period: 'current', bucket_date: '2026-09-01', signups: 3 }], 'signups', 'previous')).toBeNull();
    expect(readPeriodValue([{ bucket_date: '2026-09-01', cac: null }], 'cac')).toBeNull();
  });
});

describe('metricAccumulatesOverPeriod', () => {
  function withFormula(name: string, formula: string): MetricCatalog {
    const catalog = new Map(buildTestCatalog());
    const definition: CompilerMetricDefinition = { name, definitionKind: 'formula', formula, dimensions: [] };
    catalog.set(name, definition);
    return catalog;
  }

  it('a count, a count_distinct and a sum accumulate', () => {
    const catalog = buildTestCatalog();
    expect(metricAccumulatesOverPeriod(catalog, 'orders')).toBe(true);
    expect(metricAccumulatesOverPeriod(catalog, 'signups')).toBe(true);
    expect(metricAccumulatesOverPeriod(catalog, 'ad_spend')).toBe(true);
  });

  it('a ratio formula is a level, not a running total', () => {
    const catalog = buildTestCatalog();
    expect(metricAccumulatesOverPeriod(catalog, 'lp_conversion_rate')).toBe(false);
    expect(metricAccumulatesOverPeriod(catalog, 'cac')).toBe(false);
    expect(metricAccumulatesOverPeriod(catalog, 'floored_net_spend')).toBe(false);
  });

  it('a sum or difference of running totals, or one scaled by a constant, still accumulates', () => {
    expect(metricAccumulatesOverPeriod(withFormula('net', 'ad_spend - orders'), 'net')).toBe(true);
    expect(metricAccumulatesOverPeriod(withFormula('scaled', 'ad_spend * 0.8'), 'scaled')).toBe(true);
    expect(metricAccumulatesOverPeriod(withFormula('cents', 'ad_spend / 100'), 'cents')).toBe(true);
    expect(metricAccumulatesOverPeriod(withFormula('product', 'ad_spend * orders'), 'product')).toBe(false);
  });

  it('an avg/min/max aggregation, or an unknown metric, is a level', () => {
    const catalog = new Map(buildTestCatalog());
    catalog.set('avg_order', {
      name: 'avg_order',
      definitionKind: 'aggregation',
      aggregation: { function: 'avg', table: 'fact_order', column: 'amount', timeColumn: 'placed_at', filters: [] },
      dimensions: [],
    });
    expect(metricAccumulatesOverPeriod(catalog, 'avg_order')).toBe(false);
    expect(metricAccumulatesOverPeriod(catalog, 'nope')).toBe(false);
  });
});
