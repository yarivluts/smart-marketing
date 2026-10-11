import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { parseMetricUnit } from '@growthos/shared';
import { BUILTIN_METRIC_UNITS, builtinMetricUnit } from './builtin-metric-units';
import { builtinPackMetricDefinitions } from '../services/metric-unit-backfill.service';

describe('BUILTIN_METRIC_UNITS (KAN-213)', () => {
  const packDefinitions = builtinPackMetricDefinitions();

  it('only names metrics a built-in pack really registers, each with a valid unit', () => {
    for (const [name, unit] of Object.entries(BUILTIN_METRIC_UNITS)) {
      expect(packDefinitions.has(name), `${name} is not a built-in pack metric`).toBe(true);
      expect(parseMetricUnit(unit), `${name}: ${unit}`).not.toBeNull();
    }
  });

  it('declares a percent-style unit for every built-in *_rate metric', () => {
    const rates = [...packDefinitions.keys()].filter((name) => name.endsWith('_rate'));
    expect(rates.length).toBeGreaterThan(0);
    for (const name of rates) {
      expect(['ratio', 'percent'], name).toContain(builtinMetricUnit(name));
    }
  });

  it('declares lp_conversion_rate a 0-1 ratio, and the formula that multiplies by 100 a percent', () => {
    expect(packDefinitions.get('lp_conversion_rate')).toEqual({ kind: 'formula', formula: 'lp_conversions / lp_visitors' });
    expect(builtinMetricUnit('lp_conversion_rate')).toBe('ratio');
    expect(builtinMetricUnit('easysign_signing_completion_rate')).toBe('percent');
  });

  it('never calls a return multiple, a signed churn ratio or a score a ratio', () => {
    for (const name of ['roi_7d', 'roi_14d', 'roi_30d', 'roi_40d', 'troi', 'net_mrr_churn', 'nps_score', 'avg_signup_quality_score']) {
      expect(packDefinitions.has(name), name).toBe(true);
      expect(builtinMetricUnit(name), name).toBeUndefined();
    }
  });

  it('declares money as the project currency and support durations in seconds', () => {
    for (const name of ['ad_spend', 'mrr', 'cac', 'cost_per_signup', 'collected_revenue']) {
      expect(builtinMetricUnit(name), name).toBe('currency');
    }
    expect(builtinMetricUnit('support_avg_resolution_seconds')).toBe('duration_seconds');
    expect(builtinMetricUnit('toString')).toBeUndefined();
  });
});
