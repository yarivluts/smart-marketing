import type { MetricDefinitionInput } from '../../services/metric-registry.service';

/**
 * One metric this pack registers. All three are `featured` — the pack has no
 * supporting/unfeatured aggregations beyond the two the rate itself divides.
 */
export interface LandingPagePackMetricDefinition {
  name: string;
  featured: boolean;
  dimensions: readonly string[];
  definition: MetricDefinitionInput;
}

/**
 * Every metric here aggregates `fact_landing_page_performance` — a table
 * that, unlike the SaaS/Engagement packs' `fact_funnel_event`/`fact_revenue_
 * event`/etc. (plan `04 §1`'s canonical-but-aspirational schema, pending a
 * real warehouse in KAN-18), **actually exists in `@growthos/dbt-transform`**
 * and is built and tested against fixture data on every `pnpm test`. So
 * these three are the first pack metrics whose SQL targets a table the
 * pipeline really produces end to end. (The SaaS pack's own `ad_spend` later
 * gained a second, different route to a real relation — a self-provisioned
 * measure-schema mart view rather than a dbt-built table — see that pack's
 * own `metrics.ts` doc comment on `AD_SPEND`.)
 *
 * The three dimensions are the columns that table really carries, per the
 * SaaS pack's own rule ("declare a dimension only where the aggregation
 * table has that column"): `landing_page`, `campaign_id`, `channel_id`.
 * Breaking `lp_conversion_rate` down by `landing_page` with `campaign_id`
 * fixed is the literal question this pack exists for — "same campaign, two
 * pages, which converts better".
 *
 * `lp_visitors`/`lp_conversions` are `sum` rather than `count_distinct`
 * because the underlying table is already pre-aggregated to one row per
 * (day x page x campaign x channel) — the distinct-visitor count happened
 * in dbt, where the raw anon ids live. Summing pre-counted distincts across
 * days does mean a multi-day total counts a returning visitor once per day
 * they landed; that is the standard "daily uniques, summed" reporting
 * convention, and the alternative (a true multi-day unique) is not
 * computable from this grain at all.
 */
const VISITORS_DIMENSIONS = ['landing_page', 'campaign_id', 'channel_id'] as const;

const LP_VISITORS: LandingPagePackMetricDefinition = {
  name: 'lp_visitors',
  featured: true,
  dimensions: VISITORS_DIMENSIONS,
  definition: {
    kind: 'aggregation',
    aggregation: {
      function: 'sum',
      table: 'fact_landing_page_performance',
      column: 'visitors',
      timeColumn: 'activity_date',
      filters: [],
    },
  },
};

const LP_CONVERSIONS: LandingPagePackMetricDefinition = {
  name: 'lp_conversions',
  featured: true,
  dimensions: VISITORS_DIMENSIONS,
  definition: {
    kind: 'aggregation',
    aggregation: {
      function: 'sum',
      table: 'fact_landing_page_performance',
      column: 'conversions',
      timeColumn: 'activity_date',
      filters: [],
    },
  },
};

/**
 * The headline number. A ratio of two sums over the same rows, so it stays
 * correct under any breakdown the compiler applies (unlike averaging a
 * per-row rate, which would weight a 1-visitor page the same as a
 * 10,000-visitor one).
 */
const LP_CONVERSION_RATE: LandingPagePackMetricDefinition = {
  name: 'lp_conversion_rate',
  featured: true,
  dimensions: VISITORS_DIMENSIONS,
  definition: { kind: 'formula', formula: 'lp_conversions / lp_visitors' },
};

/**
 * Aggregation-kind first, formula-kind second: `registerMetricDefinition`
 * requires every formula reference to already be an active metric at
 * registration time, same two-phase ordering constraint the SaaS pack
 * documents.
 */
export const LANDING_PAGE_PACK_METRICS: readonly LandingPagePackMetricDefinition[] = [
  LP_VISITORS,
  LP_CONVERSIONS,
  LP_CONVERSION_RATE,
];

/** The subset that must register before {@link LP_CONVERSION_RATE} can reference them. */
export const LANDING_PAGE_PACK_AGGREGATION_METRICS: readonly LandingPagePackMetricDefinition[] = [
  LP_VISITORS,
  LP_CONVERSIONS,
];

export const LANDING_PAGE_PACK_FORMULA_METRICS: readonly LandingPagePackMetricDefinition[] = [
  LP_CONVERSION_RATE,
];

/** The names this pack's manifest declares under `registers.metrics` — kept in one place so the manifest and the definitions can't drift. */
export const LANDING_PAGE_PACK_METRIC_NAMES: readonly string[] = LANDING_PAGE_PACK_METRICS.map((metric) => metric.name);
