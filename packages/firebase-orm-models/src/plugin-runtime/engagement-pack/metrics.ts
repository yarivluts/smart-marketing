import type { MetricAggregationInput, MetricDefinitionInput } from '../../services/metric-registry.service';

/**
 * One metric this pack registers. All five are `featured` (KAN-63's own AC
 * names every one of them: "dau/wau/mau, stickiness ratio, L28/LN
 * histogram") — unlike the SaaS pack, this pack has no supporting,
 * unfeatured aggregations, since none of these five is a formula referencing
 * another.
 */
export interface EngagementPackMetricDefinition {
  name: string;
  featured: boolean;
  dimensions: readonly string[];
  definition: MetricDefinitionInput;
}

/**
 * `dau`/`wau`/`mau` share this exact aggregation — one distinct-customer
 * count over every non-touchpoint funnel event, no filter (any event counts
 * as "active", unlike the SaaS pack's own `signups`, which filters to
 * `step='signup'`) — because the metrics compiler (KAN-41) buckets a whole
 * query by whichever time grain the *request* specifies, not by anything
 * declared on the metric definition itself: querying this same aggregation
 * at `grain: 'day'` yields DAU, `'week'` yields WAU (customers active
 * anywhere in that calendar week), `'month'` yields MAU. Registering it
 * three times under three names — rather than once, the way `mrr_movements`
 * (SaaS pack) consolidates what could be several near-duplicate metrics —
 * exists purely so a human can pick a business-recognizable name straight
 * from the metric catalog/board picker without first knowing which board
 * date-range grain corresponds to which business term; that correspondence
 * is documented here, not enforced by the compiler (no metric-level "only
 * ever query this at grain X" constraint exists).
 */
const ACTIVE_CUSTOMERS_AGGREGATION: MetricAggregationInput = {
  function: 'count_distinct',
  table: 'fact_funnel_event',
  column: 'customer_id',
  timeColumn: 'ts',
  filters: [],
};

const DAU: EngagementPackMetricDefinition = {
  name: 'dau',
  featured: true,
  dimensions: [],
  definition: { kind: 'aggregation', aggregation: ACTIVE_CUSTOMERS_AGGREGATION },
};

/** Same aggregation as {@link DAU} — meant to be queried at `grain: 'week'`; see this module's own doc comment. */
const WAU: EngagementPackMetricDefinition = {
  name: 'wau',
  featured: true,
  dimensions: [],
  definition: { kind: 'aggregation', aggregation: ACTIVE_CUSTOMERS_AGGREGATION },
};

/** Same aggregation as {@link DAU} — meant to be queried at `grain: 'month'`; see this module's own doc comment. */
const MAU: EngagementPackMetricDefinition = {
  name: 'mau',
  featured: true,
  dimensions: [],
  definition: { kind: 'aggregation', aggregation: ACTIVE_CUSTOMERS_AGGREGATION },
};

/**
 * Stickiness (plan `14` gap 2: `dau_mau_ratio`). A same-grain formula over
 * `dau`/`mau` above can't express this: the compiler buckets a whole query
 * by one grain, so at `grain: 'day'` both aggregations above are literally
 * identical and a `dau / mau` formula would always evaluate to exactly `1`
 * — not a real ratio, an always-wrong constant. This instead reads a real,
 * precomputed per-day ratio off `fact_engagement_daily` (KAN-63's own new
 * dbt core model, not an aspirational plan-`04 §1` table — the "hard part"
 * this pack actually needs built, the same posture `fact_cohort_retention`
 * established for KAN-62's own heatmap). `avg` over the requested period
 * summarizes daily stickiness across however many days the query's time
 * range covers.
 */
const DAU_MAU_RATIO: EngagementPackMetricDefinition = {
  name: 'dau_mau_ratio',
  featured: true,
  dimensions: [],
  definition: {
    kind: 'aggregation',
    aggregation: { function: 'avg', table: 'fact_engagement_daily', column: 'dau_mau_ratio', timeColumn: 'activity_date', filters: [] },
  },
};

/**
 * The L28/LN engagement-depth histogram (plan `14` gap 2) — how many
 * customers were active on exactly N of the trailing `engagement_window_
 * days` (default 28) days, as of the project's own latest observed activity
 * date. Reads `fact_engagement_depth_histogram` (KAN-63's other new dbt core
 * model), broken down by `days_active_bucket` — the dimension the new
 * `histogram` board tile type uses as its bar-chart x-axis, the same
 * "one metric, one breakdown dimension" shape `heatmap` (KAN-62) already
 * established for its own matrix column axis.
 */
const ENGAGEMENT_DEPTH_HISTOGRAM: EngagementPackMetricDefinition = {
  name: 'engagement_depth_histogram',
  featured: true,
  dimensions: ['days_active_bucket'],
  definition: {
    kind: 'aggregation',
    aggregation: {
      function: 'sum',
      table: 'fact_engagement_depth_histogram',
      column: 'customer_count',
      timeColumn: 'as_of_date',
      filters: [],
    },
  },
};

/** Every metric this pack registers. None depends on another (no formula-kind metric here), so registration needs no ordering — unlike the SaaS pack's own aggregation-then-formula phasing. */
export const ENGAGEMENT_PACK_METRICS: readonly EngagementPackMetricDefinition[] = [
  DAU,
  WAU,
  MAU,
  DAU_MAU_RATIO,
  ENGAGEMENT_DEPTH_HISTOGRAM,
];

/** All five metric names KAN-63's own AC lists by name — every entry in this pack is `featured`, see this module's own doc comment. */
export const ENGAGEMENT_PACK_FEATURED_METRIC_NAMES: readonly string[] = ENGAGEMENT_PACK_METRICS.filter(
  (metric) => metric.featured,
).map((metric) => metric.name);
