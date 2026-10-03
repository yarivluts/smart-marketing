import { describe, expect, it } from 'vitest';
import {
  METRIC_INGESTION_MAPPINGS,
  getMetricIngestionRequirement,
  getPrerequisitesForMetric,
  getMetricsImpactedByMissingStreams,
  getMetricsForConnector,
  getAllMetricMappings,
  type GrowthOsMetricKey,
} from '../metric-mappings';

describe('Metric-to-Raw Ingestion Mapping Matrix', () => {
  const allExpectedKeys: GrowthOsMetricKey[] = [
    'ROI',
    'BREAKEVEN',
    'TROI',
    'LTV',
    'MRR',
    'ARR',
    'MRR_WATERFALL',
    'CHURN',
    'CAC',
    'CAS',
    'DAU_MAU',
    'ACCOUNT_SURVIVAL',
    'CONVERSION_FUNNEL',
    'PAYING_ACCOUNTS_GROWTH',
    'DEMOS_PIPELINE',
  ];

  it('defines comprehensive mappings for all 15 GrowthOS metrics', () => {
    for (const key of allExpectedKeys) {
      const mapping = METRIC_INGESTION_MAPPINGS[key];
      expect(mapping).toBeDefined();
      expect(mapping.metricKey).toBe(key);
      expect(mapping.name.length).toBeGreaterThan(0);
      expect(mapping.description.length).toBeGreaterThan(0);
      expect(mapping.requiredEventTypes.length).toBeGreaterThan(0);
      expect(mapping.requiredFields.length).toBeGreaterThan(0);
      expect(mapping.supportedConnectors.length).toBeGreaterThan(0);
      expect(mapping.missingImpactDescription.length).toBeGreaterThan(0);
      expect(mapping.recommendedQuickAction.label.length).toBeGreaterThan(0);
    }
  });

  it('getMetricIngestionRequirement returns the expected mapping', () => {
    const roi = getMetricIngestionRequirement('ROI');
    expect(roi).toBeDefined();
    expect(roi?.category).toBe('attribution_roi');
    expect(roi?.requiredEventTypes).toEqual(['ad_spend', 'customer_transaction']);

    const mrrWaterfall = getMetricIngestionRequirement('MRR_WATERFALL');
    expect(mrrWaterfall).toBeDefined();
    expect(mrrWaterfall?.requiredEventTypes).toEqual(['subscription_state_change']);
  });

  it('getPrerequisitesForMetric returns correct raw stream list', () => {
    expect(getPrerequisitesForMetric('ROI')).toEqual(['ad_spend', 'customer_transaction']);
    expect(getPrerequisitesForMetric('TROI')).toEqual(['product_telemetry', 'ad_spend', 'customer_transaction']);
    expect(getPrerequisitesForMetric('DAU_MAU')).toEqual(['product_telemetry']);
    expect(getPrerequisitesForMetric('MRR')).toEqual(['subscription_state_change']);
    expect(getPrerequisitesForMetric('CAC')).toEqual(['ad_spend', 'customer_transaction']);
    expect(getPrerequisitesForMetric('CAS')).toEqual(['ad_spend', 'product_telemetry']);
  });

  it('getMetricsImpactedByMissingStreams accurately detects affected metrics when ad_spend is missing', () => {
    const impacted = getMetricsImpactedByMissingStreams(['ad_spend']);
    const keys = impacted.map((m) => m.metricKey);

    expect(keys).toContain('ROI');
    expect(keys).toContain('BREAKEVEN');
    expect(keys).toContain('TROI');
    expect(keys).toContain('CAC');
    expect(keys).toContain('CAS');

    // Subscription-only metrics should not be impacted by ad_spend alone
    expect(keys).not.toContain('MRR');
    expect(keys).not.toContain('ARR');
    expect(keys).not.toContain('MRR_WATERFALL');
    expect(keys).not.toContain('DAU_MAU');
  });

  it('getMetricsImpactedByMissingStreams accurately detects affected metrics when subscription_state_change is missing', () => {
    const impacted = getMetricsImpactedByMissingStreams(['subscription_state_change']);
    const keys = impacted.map((m) => m.metricKey);

    expect(keys).toContain('MRR');
    expect(keys).toContain('ARR');
    expect(keys).toContain('MRR_WATERFALL');
    expect(keys).toContain('CHURN');
    expect(keys).toContain('LTV');
    expect(keys).toContain('ACCOUNT_SURVIVAL');
    expect(keys).toContain('PAYING_ACCOUNTS_GROWTH');

    expect(keys).not.toContain('DAU_MAU');
  });

  it('getMetricsForConnector returns all metrics for a given connector', () => {
    const stripeMetrics = getMetricsForConnector('stripe');
    const keys = stripeMetrics.map((m) => m.metricKey);

    expect(keys).toContain('MRR');
    expect(keys).toContain('ARR');
    expect(keys).toContain('MRR_WATERFALL');
    expect(keys).toContain('LTV');
    expect(keys).toContain('ROI');
    expect(keys).toContain('CAC');

    const sdkMetrics = getMetricsForConnector('growthos_sdk');
    const sdkKeys = sdkMetrics.map((m) => m.metricKey);
    expect(sdkKeys).toContain('DAU_MAU');
    expect(sdkKeys).toContain('TROI');
    expect(sdkKeys).toContain('CONVERSION_FUNNEL');
    expect(sdkKeys).toContain('CAS');
  });

  it('getAllMetricMappings returns all 15 metrics', () => {
    const all = getAllMetricMappings();
    expect(all.length).toBe(15);
  });
});
