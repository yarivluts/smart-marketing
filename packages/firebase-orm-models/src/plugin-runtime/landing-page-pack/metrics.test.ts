import { describe, expect, it } from 'vitest';
import {
  LANDING_PAGE_PACK_AGGREGATION_METRICS,
  LANDING_PAGE_PACK_FORMULA_METRICS,
  LANDING_PAGE_PACK_METRICS,
} from './metrics';

/** The dbt model these metrics aggregate — see `@growthos/dbt-transform`'s `models/core/fact_landing_page_performance.sql`. */
const FACT_TABLE = 'fact_landing_page_performance';

describe('LANDING_PAGE_PACK_METRICS', () => {
  it('aggregates only the real dbt table, on its real time column', () => {
    for (const metric of LANDING_PAGE_PACK_METRICS) {
      if (metric.definition.kind !== 'aggregation') continue;
      expect(metric.definition.aggregation.table).toBe(FACT_TABLE);
      expect(metric.definition.aggregation.timeColumn).toBe('activity_date');
    }
  });

  it('declares only dimensions that column really exists on the fact table', () => {
    // Mirrors the dbt model's own column list; a dimension the compiler
    // can't honestly group by would fail only at query time against a real
    // warehouse, so it is pinned here instead.
    const realColumns = new Set(['landing_page', 'campaign_id', 'channel_id']);
    for (const metric of LANDING_PAGE_PACK_METRICS) {
      for (const dimension of metric.dimensions) {
        expect(realColumns.has(dimension)).toBe(true);
      }
    }
  });

  it('orders aggregation metrics before the formula that references them', () => {
    // registerMetricDefinition requires a formula's references to already be
    // active, so the two-phase split must stay non-empty and disjoint.
    expect(LANDING_PAGE_PACK_AGGREGATION_METRICS.length).toBeGreaterThan(0);
    expect(LANDING_PAGE_PACK_FORMULA_METRICS.length).toBeGreaterThan(0);
    const aggregationNames = new Set(LANDING_PAGE_PACK_AGGREGATION_METRICS.map((m) => m.name));
    for (const formulaMetric of LANDING_PAGE_PACK_FORMULA_METRICS) {
      expect(aggregationNames.has(formulaMetric.name)).toBe(false);
    }
  });

  it('defines the conversion rate as conversions over visitors, both from this pack', () => {
    const rate = LANDING_PAGE_PACK_METRICS.find((metric) => metric.name === 'lp_conversion_rate');
    expect(rate?.definition).toEqual({ kind: 'formula', formula: 'lp_conversions / lp_visitors' });

    const names = new Set(LANDING_PAGE_PACK_METRICS.map((metric) => metric.name));
    expect(names.has('lp_conversions')).toBe(true);
    expect(names.has('lp_visitors')).toBe(true);
  });

  it('breaks every metric down by landing page and campaign — the pack\'s whole purpose', () => {
    for (const metric of LANDING_PAGE_PACK_METRICS) {
      expect(metric.dimensions).toContain('landing_page');
      expect(metric.dimensions).toContain('campaign_id');
    }
  });
});
