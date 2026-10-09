import { describe, expect, it } from 'vitest';
import {
  K_ANONYMITY_MIN_MERCHANTS,
  calculateDistribution,
  calculatePercentile,
  calculatePercentileRank,
  computePeerBenchmarkTelemetry,
  derivePerformanceTier,
  evaluateProjectScorecard,
} from './percentiles';

describe('peer-benchmarks / percentiles', () => {
  describe('calculatePercentile', () => {
    it('handles empty and single-element arrays', () => {
      expect(calculatePercentile([], 50)).toBe(0);
      expect(calculatePercentile([42], 50)).toBe(42);
      expect(calculatePercentile([42], 0)).toBe(42);
      expect(calculatePercentile([42], 100)).toBe(42);
    });

    it('interpolates percentiles accurately', () => {
      const values = [10, 20, 30, 40, 50];
      expect(calculatePercentile(values, 0)).toBe(10);
      expect(calculatePercentile(values, 50)).toBe(30);
      expect(calculatePercentile(values, 100)).toBe(50);
      expect(calculatePercentile(values, 25)).toBe(20);
      expect(calculatePercentile(values, 75)).toBe(40);
    });
  });

  describe('calculateDistribution', () => {
    it('returns empty distribution for empty values', () => {
      const dist = calculateDistribution([]);
      expect(dist.sampleMerchantCount).toBe(0);
      expect(dist.p50).toBe(0);
      expect(dist.mean).toBe(0);
    });

    it('computes distribution with mean, stdDev, and percentiles', () => {
      const values = [2.0, 3.0, 4.0, 5.0, 6.0];
      const dist = calculateDistribution(values);
      expect(dist.sampleMerchantCount).toBe(5);
      expect(dist.p50).toBe(4.0);
      expect(dist.mean).toBe(4.0);
      expect(dist.stdDev).toBeGreaterThan(1.4);
      expect(dist.p10).toBeLessThan(dist.p90);
    });
  });

  describe('calculatePercentileRank', () => {
    const values = [1.0, 2.0, 3.0, 4.0, 5.0];

    it('ranks higher values higher when higherIsBetter is true', () => {
      const rankLow = calculatePercentileRank(values, 1.0, true);
      const rankMid = calculatePercentileRank(values, 3.0, true);
      const rankHigh = calculatePercentileRank(values, 5.0, true);

      expect(rankLow).toBeLessThan(rankMid);
      expect(rankMid).toBeLessThan(rankHigh);
      expect(rankHigh).toBe(90);
    });

    it('ranks lower values higher when higherIsBetter is false (e.g. CAC)', () => {
      const rankLow = calculatePercentileRank(values, 1.0, false);
      const rankHigh = calculatePercentileRank(values, 5.0, false);

      expect(rankLow).toBeGreaterThan(rankHigh);
    });
  });

  describe('derivePerformanceTier', () => {
    it('maps percentile ranks into correct performance tiers', () => {
      expect(derivePerformanceTier(95)).toBe('top_10');
      expect(derivePerformanceTier(80)).toBe('top_quartile');
      expect(derivePerformanceTier(60)).toBe('above_median');
      expect(derivePerformanceTier(40)).toBe('below_median');
      expect(derivePerformanceTier(15)).toBe('lagging');
    });
  });

  describe('evaluateProjectScorecard', () => {
    it('evaluates project ROAS and calculates deltas vs median and top 10%', () => {
      const cohort = [1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0];
      const card = evaluateProjectScorecard('roas', 'Sales Return', 4.5, cohort, 'x', true);

      expect(card.metric).toBe('roas');
      expect(card.projectValue).toBe(4.5);
      expect(card.cohortMedian).toBeGreaterThan(0);
      expect(card.percentileRank).toBeGreaterThanOrEqual(65);
      expect(card.deltaVsMedianPct).toBeGreaterThan(0);
      expect(card.unit).toBe('x');
    });

    it('evaluates project CAC where lower values indicate better efficiency', () => {
      const cohort = [30, 40, 50, 60, 70, 80, 90, 100];
      const card = evaluateProjectScorecard('cac', 'Blended CAC', 35, cohort, '$', false);

      expect(card.metric).toBe('cac');
      expect(card.projectValue).toBe(35);
      expect(card.percentileRank).toBeGreaterThanOrEqual(80);
      expect(['top_10', 'top_quartile']).toContain(card.tier);
    });
  });

  describe('computePeerBenchmarkTelemetry', () => {
    it('enforces k-anonymity when sampleMerchantCount is below minimum threshold', () => {
      const result = computePeerBenchmarkTelemetry({}, { sampleMerchantCount: 3 });

      expect(result.hasData).toBe(false);
      expect(result.kAnonymityPassed).toBe(false);
      expect(result.minKAnonymityThreshold).toBe(K_ANONYMITY_MIN_MERCHANTS);
      expect(result.scorecards.roas.statusBadge).toBe('Insufficient Cohort Data');
      expect(result.recommendations[0]).toContain('Cohort privacy protection active');
    });

    it('returns full telemetry and recommendations when k-anonymity passes', () => {
      const result = computePeerBenchmarkTelemetry(
        { roas: 3.8, cac: 85, conversionRate: 5.2, ctr: 2.4 },
        { industry: 'b2b_saas', spendTier: 'growth', comparisonTarget: 'all' },
      );

      expect(result.hasData).toBe(true);
      expect(result.kAnonymityPassed).toBe(true);
      expect(result.industry).toBe('b2b_saas');
      expect(result.scorecards.roas.projectValue).toBe(3.8);
      expect(result.scorecards.cac.projectValue).toBe(85);
      expect(result.distributions.roas.p50).toBeGreaterThan(0);
      expect(result.retentionCurve.length).toBe(4);
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    it('handles top10 comparison target filtering', () => {
      const allResult = computePeerBenchmarkTelemetry({}, { comparisonTarget: 'all' });
      const top10Result = computePeerBenchmarkTelemetry({}, { comparisonTarget: 'top10' });

      expect(top10Result.distributions.roas.p50).toBeGreaterThanOrEqual(
        allResult.distributions.roas.p50,
      );
    });
  });
});
