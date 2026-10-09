/**
 * Types and interfaces for cross-merchant peer benchmarking telemetry (KAN-310, Stitch d9639041).
 */

export type IndustryCohort = 'b2b_saas' | 'ecommerce' | 'fintech';

export type SpendTier = 'starter' | 'growth' | 'scale';

export type ComparisonTarget = 'all' | 'top10' | 'direct';

export type BenchmarkMetricType = 'roas' | 'cac' | 'conversion_rate' | 'ctr';

export type PerformanceTier =
  | 'top_10'
  | 'top_quartile'
  | 'above_median'
  | 'below_median'
  | 'lagging';

export interface PercentileDistribution {
  p10: number;
  p25: number;
  p50: number; // Median
  p75: number;
  p90: number; // Top 10%
  mean: number;
  stdDev: number;
  sampleMerchantCount: number;
}

export interface ProjectBenchmarkScorecard {
  metric: BenchmarkMetricType;
  label: string;
  projectValue: number;
  cohortMedian: number;
  cohortTop10: number;
  percentileRank: number; // 0 to 100
  tier: PerformanceTier;
  deltaVsMedianPct: number;
  deltaVsTop10Pct: number;
  statusBadge: string;
  statusAccent: 'emerald' | 'primary' | 'sky' | 'amber' | 'rose';
  unit: string;
}

export interface RetentionCohortMonth {
  month: 'M1' | 'M3' | 'M6' | 'M12';
  projectRetentionPct: number;
  cohortMedianRetentionPct: number;
  cohortTop10RetentionPct: number;
}

export interface PeerBenchmarksTelemetryResult {
  hasData: boolean;
  kAnonymityPassed: boolean;
  minKAnonymityThreshold: number;
  sampleMerchantCount: number;
  industry: IndustryCohort;
  spendTier: SpendTier;
  comparisonTarget: ComparisonTarget;
  lastAggregatedAt: string;
  scorecards: {
    roas: ProjectBenchmarkScorecard;
    cac: ProjectBenchmarkScorecard;
    conversionRate: ProjectBenchmarkScorecard;
    ctr: ProjectBenchmarkScorecard;
  };
  distributions: {
    roas: PercentileDistribution;
    cac: PercentileDistribution;
    conversionRate: PercentileDistribution;
    ctr: PercentileDistribution;
  };
  retentionCurve: RetentionCohortMonth[];
  recommendations: string[];
}

export interface PeerBenchmarkFilterOptions {
  industry?: IndustryCohort;
  spendTier?: SpendTier;
  comparisonTarget?: ComparisonTarget;
}
