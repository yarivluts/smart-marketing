import { describe, expect, it } from 'vitest';

/**
 * Test Suite for F14: Metric-to-Raw Ingestion Mapping
 * Verifies Tier 1 (Happy Path), Tier 2 (Boundary & Error Cases), Prerequisite
 * Resolution, Multi-Stream Dependencies, Gap Identification, and Metric Matrix Integrity.
 *
 * Source: ORIGINAL_REQUEST §R2, PROJECT.md §2, TEST_INFRA.md F14
 */

export type MetricIdentifier =
  | 'troi'
  | 'payback_months'
  | 'ltv'
  | 'mrr'
  | 'mrr_waterfall'
  | 'new_mrr'
  | 'expansion_mrr'
  | 'contraction_mrr'
  | 'gross_churn'
  | 'net_churn'
  | 'cac'
  | 'cost_per_signup'
  | 'dau'
  | 'mau'
  | 'stickiness_ratio'
  | 'demos_held';

export type RawStreamKey =
  | 'ad_spend'
  | 'customer_transaction'
  | 'subscription_state_change'
  | 'product_telemetry'
  | 'crm_lifecycle'
  | 'touchpoint'
  | 'cancellation_reason';

export interface MetricIngestionRequirement {
  metric: MetricIdentifier;
  label: string;
  requiredStreams: RawStreamKey[];
  primaryConnectors: string[];
}

export const METRIC_INGESTION_CATALOG: Record<MetricIdentifier, MetricIngestionRequirement> = {
  troi: {
    metric: 'troi',
    label: 'True Return On Investment (TROI)',
    requiredStreams: ['ad_spend', 'customer_transaction', 'touchpoint'],
    primaryConnectors: ['google_ads', 'meta_ads', 'stripe'],
  },
  payback_months: {
    metric: 'payback_months',
    label: 'Payback Velocity (Months to Breakeven)',
    requiredStreams: ['ad_spend', 'customer_transaction'],
    primaryConnectors: ['google_ads', 'meta_ads', 'stripe'],
  },
  ltv: {
    metric: 'ltv',
    label: 'Customer Lifetime Value (LTV)',
    requiredStreams: ['customer_transaction', 'subscription_state_change'],
    primaryConnectors: ['stripe', 'chargebee'],
  },
  mrr: {
    metric: 'mrr',
    label: 'Monthly Recurring Revenue (MRR)',
    requiredStreams: ['subscription_state_change'],
    primaryConnectors: ['stripe', 'chargebee', 'paddle'],
  },
  mrr_waterfall: {
    metric: 'mrr_waterfall',
    label: 'MRR Growth Waterfall & Bridge',
    requiredStreams: ['subscription_state_change'],
    primaryConnectors: ['stripe', 'chargebee', 'paddle'],
  },
  new_mrr: {
    metric: 'new_mrr',
    label: 'New MRR',
    requiredStreams: ['subscription_state_change'],
    primaryConnectors: ['stripe', 'chargebee', 'paddle'],
  },
  expansion_mrr: {
    metric: 'expansion_mrr',
    label: 'Expansion MRR',
    requiredStreams: ['subscription_state_change'],
    primaryConnectors: ['stripe', 'chargebee', 'paddle'],
  },
  contraction_mrr: {
    metric: 'contraction_mrr',
    label: 'Contraction MRR',
    requiredStreams: ['subscription_state_change'],
    primaryConnectors: ['stripe', 'chargebee', 'paddle'],
  },
  gross_churn: {
    metric: 'gross_churn',
    label: 'Gross MRR Churn Rate',
    requiredStreams: ['subscription_state_change'],
    primaryConnectors: ['stripe', 'chargebee', 'paddle'],
  },
  net_churn: {
    metric: 'net_churn',
    label: 'Net MRR Churn Rate',
    requiredStreams: ['subscription_state_change'],
    primaryConnectors: ['stripe', 'chargebee', 'paddle'],
  },
  cac: {
    metric: 'cac',
    label: 'Customer Acquisition Cost (CAC)',
    requiredStreams: ['ad_spend', 'customer_transaction'],
    primaryConnectors: ['google_ads', 'meta_ads', 'stripe'],
  },
  cost_per_signup: {
    metric: 'cost_per_signup',
    label: 'Cost Per Signup (CAS)',
    requiredStreams: ['ad_spend', 'product_telemetry'],
    primaryConnectors: ['google_ads', 'meta_ads', 'growthos_sdk'],
  },
  dau: {
    metric: 'dau',
    label: 'Daily Active Users (DAU)',
    requiredStreams: ['product_telemetry'],
    primaryConnectors: ['growthos_sdk'],
  },
  mau: {
    metric: 'mau',
    label: 'Monthly Active Users (MAU)',
    requiredStreams: ['product_telemetry'],
    primaryConnectors: ['growthos_sdk'],
  },
  stickiness_ratio: {
    metric: 'stickiness_ratio',
    label: 'DAU/MAU Stickiness Ratio',
    requiredStreams: ['product_telemetry'],
    primaryConnectors: ['growthos_sdk'],
  },
  demos_held: {
    metric: 'demos_held',
    label: 'Sales Demos Held & Pipeline',
    requiredStreams: ['crm_lifecycle'],
    primaryConnectors: ['hubspot', 'salesforce'],
  },
};

export interface PrerequisiteResolution {
  metric: MetricIdentifier;
  canCalculate: boolean;
  missingStreams: RawStreamKey[];
  availableStreams: RawStreamKey[];
}

export function resolveMetricPrerequisites(
  metric: MetricIdentifier,
  activeStreams: RawStreamKey[],
): PrerequisiteResolution {
  const req = METRIC_INGESTION_CATALOG[metric];
  if (!req) {
    throw new Error(`Unregistered metric: ${metric}`);
  }

  const missingStreams = req.requiredStreams.filter((s) => !activeStreams.includes(s));
  const availableStreams = req.requiredStreams.filter((s) => activeStreams.includes(s));

  return {
    metric,
    canCalculate: missingStreams.length === 0,
    missingStreams,
    availableStreams,
  };
}

export function findBlockedMetrics(activeStreams: RawStreamKey[]): MetricIdentifier[] {
  return (Object.keys(METRIC_INGESTION_CATALOG) as MetricIdentifier[]).filter((metric) => {
    const res = resolveMetricPrerequisites(metric, activeStreams);
    return !res.canCalculate;
  });
}

describe('F14: Metric-to-Raw Ingestion Mapping Matrix', () => {
  describe('Tier 1: Primary Happy Path Scenarios', () => {
    it('F14-T1-01: resolves TROI when ad_spend, customer_transaction, and touchpoint are active', () => {
      const active: RawStreamKey[] = ['ad_spend', 'customer_transaction', 'touchpoint'];
      const res = resolveMetricPrerequisites('troi', active);
      expect(res.canCalculate).toBe(true);
      expect(res.missingStreams).toHaveLength(0);
      expect(res.availableStreams).toHaveLength(3);
    });

    it('F14-T1-02: resolves MRR Waterfall when subscription_state_change is active', () => {
      const active: RawStreamKey[] = ['subscription_state_change'];
      const res = resolveMetricPrerequisites('mrr_waterfall', active);
      expect(res.canCalculate).toBe(true);
      expect(res.missingStreams).toHaveLength(0);
    });

    it('F14-T1-03: resolves CAC when ad_spend and customer_transaction are active', () => {
      const active: RawStreamKey[] = ['ad_spend', 'customer_transaction'];
      const res = resolveMetricPrerequisites('cac', active);
      expect(res.canCalculate).toBe(true);
    });

    it('F14-T1-04: resolves DAU/MAU Stickiness when product_telemetry is active', () => {
      const active: RawStreamKey[] = ['product_telemetry'];
      const res = resolveMetricPrerequisites('stickiness_ratio', active);
      expect(res.canCalculate).toBe(true);
    });

    it('F14-T1-05: resolves Demos Pipeline when crm_lifecycle is active', () => {
      const active: RawStreamKey[] = ['crm_lifecycle'];
      const res = resolveMetricPrerequisites('demos_held', active);
      expect(res.canCalculate).toBe(true);
    });
  });

  describe('Tier 2: Boundary Values & Error Handling', () => {
    it('F14-T2-01: identifies missing ad_spend for TROI when only customer_transaction is active', () => {
      const active: RawStreamKey[] = ['customer_transaction', 'touchpoint'];
      const res = resolveMetricPrerequisites('troi', active);
      expect(res.canCalculate).toBe(false);
      expect(res.missingStreams).toEqual(['ad_spend']);
    });

    it('F14-T2-02: identifies all metrics blocked when zero streams are active', () => {
      const blocked = findBlockedMetrics([]);
      expect(blocked.length).toBe(Object.keys(METRIC_INGESTION_CATALOG).length);
      expect(blocked).toContain('troi');
      expect(blocked).toContain('mrr');
      expect(blocked).toContain('cac');
      expect(blocked).toContain('dau');
    });

    it('F14-T2-03: throws error when resolving an uncataloged metric identifier', () => {
      expect(() => resolveMetricPrerequisites('non_existent_metric' as unknown as MetricIdentifier, ['ad_spend'])).toThrow(
        /Unregistered metric/,
      );
    });


    it('F14-T2-04: correctly handles multi-stream partial subsets (e.g. only telemetry active)', () => {
      const active: RawStreamKey[] = ['product_telemetry'];
      const blocked = findBlockedMetrics(active);
      expect(blocked).not.toContain('dau');
      expect(blocked).not.toContain('mau');
      expect(blocked).not.toContain('stickiness_ratio');
      expect(blocked).toContain('troi');
      expect(blocked).toContain('mrr');
      expect(blocked).toContain('demos_held');
    });

    it('F14-T2-05: ensures no circular or empty required streams exist in catalog', () => {
      for (const [metric, config] of Object.entries(METRIC_INGESTION_CATALOG)) {
        expect(config.requiredStreams.length).toBeGreaterThan(0);
        expect(config.primaryConnectors.length).toBeGreaterThan(0);
        expect(config.label).toBeTruthy();
        expect(config.metric).toBe(metric);
      }
    });
  });
});
