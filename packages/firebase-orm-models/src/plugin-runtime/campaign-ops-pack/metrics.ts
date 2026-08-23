import type { MetricDefinitionInput } from '../../services/metric-registry.service';

/**
 * The `collection_nd` half of KAN-86's "roi_nd / collection_nd metric
 * family" AC (plan `14 §Gap 12`): fixed-window payback, targeting
 * `fact_customer_payback` (`packages/dbt-transform/dbt/models/core/
 * fact_customer_payback.sql`) — see that model's own doc comment for why
 * the window set is a fixed 7/14/30/40-day catalog rather than a single
 * runtime-configurable N, and why this pack does not also register
 * `roi_Nd` formulas: those would need to divide by the SaaS metric pack's
 * own `ad_spend` metric, and the metrics compiler only allows a formula to
 * reference an already-*active* metric at registration time (`04 §2`'s own
 * commerce-metric family already documents this ordering requirement) — an
 * inter-pack "install this pack first" dependency this codebase's install
 * flow (`installPluginAndProvisionBuiltins`) doesn't model yet. Once both
 * packs are installed in a project, a human can already compose
 * `collection_40d / ad_spend` by hand today via the existing Metric Defs
 * "evolve"/custom-formula admin flow — no code change needed for that; only
 * shipping it as a pre-built pack metric is deferred.
 */
export interface CampaignOpsPackMetricDefinition {
  name: string;
  dimensions: readonly string[];
  definition: MetricDefinitionInput;
}

function collectionMetric(windowDays: 7 | 14 | 30 | 40): CampaignOpsPackMetricDefinition {
  return {
    name: `collection_${windowDays}d`,
    dimensions: [],
    definition: {
      kind: 'aggregation',
      aggregation: {
        function: 'sum',
        table: 'fact_customer_payback',
        column: `collected_revenue_${windowDays}d`,
        timeColumn: 'acquired_at',
        filters: [],
      },
    },
  };
}

export const CAMPAIGN_OPS_PACK_METRICS: readonly CampaignOpsPackMetricDefinition[] = [
  collectionMetric(7),
  collectionMetric(14),
  collectionMetric(30),
  collectionMetric(40),
];
