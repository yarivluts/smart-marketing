import { describe, expect, it } from 'vitest';
import {
  METRIC_INGESTION_MAPPINGS,
  type GrowthOsMetricKey,
  type CanonicalEventType,
} from '@growthos/shared';

export interface ConnectorStatusRecord {
  connectorId: string;
  name: string;
  category: string;
  status: 'active' | 'degraded' | 'missing' | 'available';
  supportedEventTypes: CanonicalEventType[];
  lastEventAt?: string;
  errorQuarantineCount?: number;
}

export interface MetricPrerequisiteResolution {
  metricKey: GrowthOsMetricKey;
  isReady: boolean;
  activeConnectors: string[];
  missingConnectors: string[];
  missingEventTypes: CanonicalEventType[];
  missingDataPoints: string[];
  impactDescription: string;
}

export function resolveMetricPrerequisites(
  metricKey: GrowthOsMetricKey,
  activeConnectors: ConnectorStatusRecord[],
): MetricPrerequisiteResolution {
  const mapping = METRIC_INGESTION_MAPPINGS[metricKey];
  if (!mapping) {
    throw new Error(`Unknown metric key: ${metricKey}`);
  }

  const activeTypes = new Set(
    activeConnectors
      .filter((c) => c.status === 'active')
      .flatMap((c) => c.supportedEventTypes),
  );

  const missingEventTypes = mapping.requiredEventTypes.filter((req) => !activeTypes.has(req));
  const activeIds = activeConnectors.filter((c) => c.status === 'active').map((c) => c.connectorId);
  const missingConnectors = mapping.supportedConnectors.filter((id) => !activeIds.includes(id));

  const missingDataPoints = missingEventTypes.map((et) => {
    switch (et) {
      case 'ad_spend':
        return 'Ad spend metrics & campaign UTM tracking';
      case 'customer_transaction':
        return 'Customer purchase & renewal transaction stream';
      case 'subscription_state_change':
        return 'Subscription lifecycle & cancellation webhooks';
      case 'product_telemetry':
        return 'Web/Mobile SDK telemetry & session tracking';
      case 'crm_lifecycle':
        return 'CRM deal stage & pipeline sync';
    }
  });

  return {
    metricKey,
    isReady: missingEventTypes.length === 0,
    activeConnectors: activeIds,
    missingConnectors,
    missingEventTypes,
    missingDataPoints,
    impactDescription: mapping.missingImpactDescription,
  };
}

describe('F15: Missing Data Stream Detection Hook / Status Resolver', () => {
  const sampleActiveConnectors: ConnectorStatusRecord[] = [
    {
      connectorId: 'stripe',
      name: 'Stripe Billing',
      category: 'Billing & Revenue',
      status: 'active',
      supportedEventTypes: ['customer_transaction', 'subscription_state_change'],
      lastEventAt: '2026-04-17T12:00:00Z',
    },
    {
      connectorId: 'google_ads',
      name: 'Google Ads',
      category: 'Ad Networks',
      status: 'active',
      supportedEventTypes: ['ad_spend'],
      lastEventAt: '2026-04-17T11:45:00Z',
    },
  ];

  describe('Tier 1: Primary Happy Path Scenarios', () => {
    it('F15-T1-01: resolves isReady = true when all required streams are active (ROI)', () => {
      const result = resolveMetricPrerequisites('ROI', sampleActiveConnectors);

      expect(result.isReady).toBe(true);
      expect(result.missingEventTypes).toHaveLength(0);
      expect(result.missingDataPoints).toHaveLength(0);
    });

    it('F15-T1-02: resolves isReady = false when a prerequisite stream is missing (BREAKEVEN missing telemetry)', () => {
      // BREAKEVEN requires ad_spend, customer_transaction, product_telemetry
      const result = resolveMetricPrerequisites('BREAKEVEN', sampleActiveConnectors);

      expect(result.isReady).toBe(false);
      expect(result.missingEventTypes).toContain('product_telemetry');
      expect(result.missingDataPoints).toContain('Web/Mobile SDK telemetry & session tracking');
    });

    it('F15-T1-03: identifies missing subscription stream for MRR_WATERFALL', () => {
      const adOnlyConnectors: ConnectorStatusRecord[] = [
        {
          connectorId: 'meta_ads',
          name: 'Meta Marketing API',
          category: 'Ad Networks',
          status: 'active',
          supportedEventTypes: ['ad_spend'],
        },
      ];

      const result = resolveMetricPrerequisites('MRR_WATERFALL', adOnlyConnectors);

      expect(result.isReady).toBe(false);
      expect(result.missingEventTypes).toContain('subscription_state_change');
    });

    it('F15-T1-04: provides descriptive metric impact message from canonical mapping', () => {
      const result = resolveMetricPrerequisites('CHURN', []);

      expect(result.isReady).toBe(false);
      expect(result.impactDescription).toBe(METRIC_INGESTION_MAPPINGS.CHURN.missingImpactDescription);
    });

    it('F15-T1-05: resolves DAU_MAU stickiness prerequisites when web SDK is active', () => {
      const sdkConnectors: ConnectorStatusRecord[] = [
        {
          connectorId: 'growthos_web_sdk',
          name: 'GrowthOS Web SDK',
          category: 'Telemetry & Identity',
          status: 'active',
          supportedEventTypes: ['product_telemetry'],
        },
      ];

      const result = resolveMetricPrerequisites('DAU_MAU', sdkConnectors);
      expect(result.isReady).toBe(true);
    });
  });

  describe('Tier 2: Boundary Values & Error Handling', () => {
    it('F15-T2-01: treats degraded connectors (e.g. token expired) as inactive for prerequisite calculation', () => {
      const degradedConnectors: ConnectorStatusRecord[] = [
        {
          connectorId: 'stripe',
          name: 'Stripe Billing',
          category: 'Billing & Revenue',
          status: 'degraded',
          supportedEventTypes: ['customer_transaction', 'subscription_state_change'],
          errorQuarantineCount: 14,
        },
      ];

      const result = resolveMetricPrerequisites('MRR', degradedConnectors);
      expect(result.isReady).toBe(false);
      expect(result.missingEventTypes).toContain('subscription_state_change');
    });

    it('F15-T2-02: throws descriptive error on unknown metric key', () => {
      expect(() => resolveMetricPrerequisites('UNKNOWN_KEY' as any, [])).toThrow(
        /Unknown metric key: UNKNOWN_KEY/,
      );
    });

    it('F15-T2-03: returns empty missing lists when all 5 canonical streams are active', () => {
      const allActive: ConnectorStatusRecord[] = [
        {
          connectorId: 'stripe',
          name: 'Stripe',
          category: 'Billing',
          status: 'active',
          supportedEventTypes: ['subscription_state_change', 'customer_transaction'],
        },
        {
          connectorId: 'google_ads',
          name: 'Google Ads',
          category: 'Ads',
          status: 'active',
          supportedEventTypes: ['ad_spend'],
        },
        {
          connectorId: 'sdk',
          name: 'SDK',
          category: 'Telemetry',
          status: 'active',
          supportedEventTypes: ['product_telemetry'],
        },
        {
          connectorId: 'hubspot',
          name: 'HubSpot',
          category: 'CRM',
          status: 'active',
          supportedEventTypes: ['crm_lifecycle'],
        },
      ];

      const metrics: GrowthOsMetricKey[] = ['ROI', 'BREAKEVEN', 'TROI', 'MRR', 'CAC', 'DAU_MAU', 'DEMOS_PIPELINE'];
      metrics.forEach((metric) => {
        const res = resolveMetricPrerequisites(metric, allActive);
        expect(res.isReady).toBe(true);
        expect(res.missingEventTypes).toHaveLength(0);
      });
    });

    it('F15-T2-04: handles empty connector list without crashing', () => {
      const res = resolveMetricPrerequisites('LTV', []);
      expect(res.isReady).toBe(false);
      expect(res.activeConnectors).toHaveLength(0);
      expect(res.missingEventTypes.length).toBeGreaterThan(0);
    });

    it('F15-T2-05: resolves multi-stream requirements for DEMOS_PIPELINE (CRM + Transactions)', () => {
      const crmOnly: ConnectorStatusRecord[] = [
        {
          connectorId: 'hubspot',
          name: 'HubSpot',
          category: 'CRM & Sales',
          status: 'active',
          supportedEventTypes: ['crm_lifecycle'],
        },
      ];

      const res = resolveMetricPrerequisites('DEMOS_PIPELINE', crmOnly);
      expect(res.isReady).toBe(false);
      expect(res.missingEventTypes).toContain('customer_transaction');
    });
  });
});
