import { describe, expect, it } from 'vitest';
import {
  buildExecutiveBlendedMetrics,
  buildExecutiveReportData,
  calculateBlendedCac,
  calculateBlendedRoas,
  getDeterministicFactor,
} from './executive-reporting-synthesizer';

describe('ExecutiveReportingSynthesizer Unit Tests', () => {
  it('derives stable deterministic factors across identical seeds', () => {
    const factor1 = getDeterministicFactor('project-alpha');
    const factor2 = getDeterministicFactor('project-alpha');
    expect(factor1).toBe(factor2);
    expect(factor1).toBeGreaterThanOrEqual(0.85);
    expect(factor1).toBeLessThanOrEqual(1.15);
  });

  it('safely protects against division-by-zero for CAC and ROAS', () => {
    expect(calculateBlendedCac(0, 0)).toBe(0);
    expect(calculateBlendedCac(15000, 0)).toBe(0);
    expect(calculateBlendedCac(15000, 300)).toBe(50.0);

    expect(calculateBlendedRoas(0, 0)).toBe(0);
    expect(calculateBlendedRoas(50000, 0)).toBe(0);
    expect(calculateBlendedRoas(50000, 15000)).toBe(3.33);
  });

  it('scales spend, volume, and period comparison metrics with time windows', () => {
    const metrics30d = buildExecutiveBlendedMetrics({ timeWindow: '30d', seed: 'test-seed' });
    const metrics7d = buildExecutiveBlendedMetrics({ timeWindow: '7d', seed: 'test-seed' });
    const metrics90d = buildExecutiveBlendedMetrics({ timeWindow: '90d', seed: 'test-seed' });

    expect(metrics7d.totalSpendUsd).toBeLessThan(metrics30d.totalSpendUsd);
    expect(metrics90d.totalSpendUsd).toBeGreaterThan(metrics30d.totalSpendUsd);
    expect(metrics7d.totalConversions).toBeLessThan(metrics30d.totalConversions);
    expect(metrics90d.totalConversions).toBeGreaterThan(metrics30d.totalConversions);
  });

  it('builds full report data with 100% channel percentage sum', () => {
    const report = buildExecutiveReportData({ timeWindow: '30d' });
    expect(report.channels).toHaveLength(2);
    const sumPct = report.channels.reduce((acc, c) => acc + c.percentage, 0);
    expect(sumPct).toBe(100);
    expect(report.rebalancingRecommendation).toBeDefined();
  });
});
