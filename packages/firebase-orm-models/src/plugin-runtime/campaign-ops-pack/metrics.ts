import type { MetricDefinitionInput } from '../../services/metric-registry.service';
import { SAAS_METRIC_PACK_METRICS } from '../saas-metric-pack';

/**
 * The `collection_nd` half of KAN-86's "roi_nd / collection_nd metric
 * family" AC (plan `14 §Gap 12`): fixed-window payback, targeting
 * `fact_customer_payback` (`packages/dbt-transform/dbt/models/core/
 * fact_customer_payback.sql`) — see that model's own doc comment for why
 * the window set is a fixed 7/14/30/40-day catalog rather than a single
 * runtime-configurable N. Broken down by `campaign_id`
 * (2026-08-25 follow-up) now that `fact_customer_payback` joins the
 * customer's acquisition event to its own last-touch attribution.
 *
 * `roi_Nd = collection_Nd / ad_spend` (below) reuses the SaaS metric pack's
 * own `ad_spend` metric verbatim, the exact same "register the dependency's
 * metric under this pack too, tolerating `DuplicateMetricDefinitionError`
 * either way" pattern `quality-score-pack/metrics.ts`'s own `AD_SPEND`
 * already establishes for the identical cross-pack dependency — whichever
 * of the SaaS/Quality/Campaign Ops packs installs first in a project "wins"
 * registering the real metric, the other two's own attempt is a no-op. This
 * closes the ordering gap the old deferred note here named: the compiler
 * itself never needed a join-graph feature (see `fact_customer_payback.sql`'s
 * own updated doc comment) — `registerMetricDefinition` just requires a
 * formula's references to already be *active*, so `index.ts` registers
 * `ad_spend` in the same phase as `collection_Nd` (both aggregation-kind),
 * before the `roi_Nd` formulas.
 */
export interface CampaignOpsPackMetricDefinition {
  name: string;
  dimensions: readonly string[];
  definition: MetricDefinitionInput;
}

function collectionMetric(windowDays: 7 | 14 | 30 | 40): CampaignOpsPackMetricDefinition {
  return {
    name: `collection_${windowDays}d`,
    dimensions: ['campaign_id'],
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

/** Reused from the SaaS pack verbatim — see this module's own doc comment. */
const AD_SPEND: CampaignOpsPackMetricDefinition = (() => {
  const found = SAAS_METRIC_PACK_METRICS.find((metric) => metric.name === 'ad_spend');
  if (!found) {
    throw new Error('campaign-ops-pack: expected the SaaS pack to declare an "ad_spend" metric to reuse.');
  }
  return { name: found.name, dimensions: found.dimensions, definition: found.definition };
})();

function roiMetric(windowDays: 7 | 14 | 30 | 40): CampaignOpsPackMetricDefinition {
  return {
    name: `roi_${windowDays}d`,
    dimensions: ['campaign_id'],
    definition: { kind: 'formula', formula: `collection_${windowDays}d / ad_spend` },
  };
}

/** Phase 1: every `collection_Nd` aggregation plus the reused `ad_spend`, plus the calibration aggregations below — none reference each other, so they can all register together. */
export const CAMPAIGN_OPS_PACK_METRICS: readonly CampaignOpsPackMetricDefinition[] = [
  collectionMetric(7),
  collectionMetric(14),
  collectionMetric(30),
  collectionMetric(40),
  AD_SPEND,
];

/** Phase 2 (formulas): `roi_Nd`, each dividing its own `collection_Nd` by the phase-1 `ad_spend`. */
export const CAMPAIGN_OPS_PACK_ROI_FORMULA_METRICS: readonly CampaignOpsPackMetricDefinition[] = [
  roiMetric(7),
  roiMetric(14),
  roiMetric(30),
  roiMetric(40),
];

/**
 * Predicted-vs-actual calibration (KAN-86's own remaining AC bullet, plan
 * `14 §Gap 12`): three aggregations against `fact_quality_calibration`
 * (`packages/dbt-transform/dbt/models/core/fact_quality_calibration.sql`,
 * which joins KAN-83's `fact_signup_quality_score` to this pack's own
 * `fact_customer_payback`), broken down by `quality_tier` — does a
 * high-scored signup actually convert and pay more than a low-scored one?
 *
 * Targets a fresh mart rather than reusing `fact_signup_quality_score`/
 * `fact_customer_payback` directly: the metrics compiler only emits bare
 * column references (no generic cross-table join), so the "predicted tier
 * next to actual revenue" comparison needs its own pre-joined table, the
 * same reasoning `fact_survey_response`/`fact_funnel_event` already give for
 * their own flattened marts.
 *
 * Two phases, same ordering reason `QUALITY_SCORE_PACK_METRICS`'s own doc
 * comment gives: `quality_calibration_paying_rate`/
 * `quality_calibration_avg_collected_revenue_40d` are formulas over the three
 * aggregations below, so those three must finish registering first
 * (`index.ts` registers this pack in ordered phases, not one `Promise.all`).
 */
const QUALITY_CALIBRATION_SIGNUPS: CampaignOpsPackMetricDefinition = {
  name: 'quality_calibration_signups',
  dimensions: ['quality_tier'],
  definition: {
    kind: 'aggregation',
    aggregation: { function: 'count_distinct', table: 'fact_quality_calibration', column: 'customer_id', timeColumn: 'ts', filters: [] },
  },
};

/** The paying-customer-only slice of {@link QUALITY_CALIBRATION_SIGNUPS} — `quality_calibration_paying_rate`'s own numerator. */
const QUALITY_CALIBRATION_PAYING_SIGNUPS: CampaignOpsPackMetricDefinition = {
  name: 'quality_calibration_paying_signups',
  dimensions: ['quality_tier'],
  definition: {
    kind: 'aggregation',
    aggregation: {
      function: 'count_distinct',
      table: 'fact_quality_calibration',
      column: 'customer_id',
      timeColumn: 'ts',
      filters: [{ field: 'is_paying_customer', operator: '=', value: 'true' }],
    },
  },
};

const QUALITY_CALIBRATION_COLLECTED_REVENUE_40D: CampaignOpsPackMetricDefinition = {
  name: 'quality_calibration_collected_revenue_40d',
  dimensions: ['quality_tier'],
  definition: {
    kind: 'aggregation',
    aggregation: { function: 'sum', table: 'fact_quality_calibration', column: 'collected_revenue_40d', timeColumn: 'ts', filters: [] },
  },
};

/** Phase 1 (aggregations): must all finish registering before the phase-2 formulas below. */
export const CAMPAIGN_OPS_PACK_CALIBRATION_AGGREGATION_METRICS: readonly CampaignOpsPackMetricDefinition[] = [
  QUALITY_CALIBRATION_SIGNUPS,
  QUALITY_CALIBRATION_PAYING_SIGNUPS,
  QUALITY_CALIBRATION_COLLECTED_REVENUE_40D,
];

const QUALITY_CALIBRATION_PAYING_RATE: CampaignOpsPackMetricDefinition = {
  name: 'quality_calibration_paying_rate',
  dimensions: ['quality_tier'],
  definition: { kind: 'formula', formula: 'quality_calibration_paying_signups / quality_calibration_signups' },
};

const QUALITY_CALIBRATION_AVG_COLLECTED_REVENUE_40D: CampaignOpsPackMetricDefinition = {
  name: 'quality_calibration_avg_collected_revenue_40d',
  dimensions: ['quality_tier'],
  definition: { kind: 'formula', formula: 'quality_calibration_collected_revenue_40d / quality_calibration_signups' },
};

/** Phase 2 (formulas): reference only the phase-1 aggregations above. */
export const CAMPAIGN_OPS_PACK_CALIBRATION_FORMULA_METRICS: readonly CampaignOpsPackMetricDefinition[] = [
  QUALITY_CALIBRATION_PAYING_RATE,
  QUALITY_CALIBRATION_AVG_COLLECTED_REVENUE_40D,
];
