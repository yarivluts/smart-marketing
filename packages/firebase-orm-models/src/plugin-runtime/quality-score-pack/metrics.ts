import type { MetricDefinitionInput } from '../../services/metric-registry.service';
import { SAAS_METRIC_PACK_METRICS } from '../saas-metric-pack';

export interface QualityScorePackMetricDefinition {
  name: string;
  dimensions: readonly string[];
  definition: MetricDefinitionInput;
}

/**
 * The Intent & Quality Scoring pack's metrics (KAN-83, plan `14 §Gap 4`),
 * all targeting `fact_signup_quality_score` — a new dbt core mart
 * (`packages/dbt-transform/dbt/models/core/fact_signup_quality_score.sql`)
 * that flattens an `onboarding_survey` event's already-computed
 * `quality_score` into a real column and joins each scored signup to its
 * last-touch marketing channel, signup cohort month, and whether it ever
 * became a paying customer — mirroring `fact_cancellation_reason`'s own join
 * pattern (KAN-84).
 *
 * Two phases, the same reason `SAAS_METRIC_PACK_METRICS`'s own doc comment
 * gives: `registerMetricDefinition` requires a formula's referenced metrics
 * to already be *active* at registration time, so every aggregation-kind
 * metric below must finish registering before a formula-kind one that
 * depends on it (`index.ts` registers this pack in ordered phases, not one
 * `Promise.all`).
 *
 * Every supporting aggregation below is a plain `sum`/`count_distinct`
 * rather than the compiler's own `avg` function, even though the value being
 * computed IS an average — deliberately, so the same sum/count pair folds
 * correctly across more than one `bucket_date` row (the compiler always
 * time-buckets, see `compiler.ts`'s own doc comment) via simple addition; an
 * `avg`-kind aggregation queried across multiple buckets would need a
 * weighted re-average, which nothing in this codebase's own view-mapper
 * layer does today (`toCancellationReasonDimensionBreakdownRows`, the
 * closest precedent, only ever folds `count`/`sum`-shaped values). Each
 * `sum`/`count_distinct` pair is then exposed as a single average via a
 * `formula`-kind metric (`avg_signup_quality_score`) for board/API
 * consumers that want one named metric.
 *
 * `dimensions` on a formula metric must be a real column on *every* leaf
 * aggregation table the formula transitively resolves to, not just its own
 * table — `channel_id` is common to `fact_signup_quality_score` and the
 * SaaS pack's own `ad_spend` mart, but `cohort_month` only exists on the
 * former, so any formula mixing in `ad_spend` (the two `quality_adjusted_*`
 * metrics) is restricted to `dimensions: ['channel_id']` even though its own
 * non-`ad_spend` leaves would otherwise also support `cohort_month`.
 */
const SIGNUP_QUALITY_SCORE_SUM: QualityScorePackMetricDefinition = {
  name: 'signup_quality_score_sum',
  dimensions: ['channel_id', 'cohort_month'],
  definition: {
    kind: 'aggregation',
    aggregation: { function: 'sum', table: 'fact_signup_quality_score', column: 'quality_score', timeColumn: 'ts', filters: [] },
  },
};

const SIGNUPS_SCORED: QualityScorePackMetricDefinition = {
  name: 'signups_scored',
  dimensions: ['channel_id', 'cohort_month'],
  definition: {
    kind: 'aggregation',
    aggregation: { function: 'count_distinct', table: 'fact_signup_quality_score', column: 'customer_id', timeColumn: 'ts', filters: [] },
  },
};

/** The paying-customer-only slice of {@link SIGNUP_QUALITY_SCORE_SUM} — `quality_adjusted_cac`'s own numerator half (see this module's own doc comment on why CAC needs a distinct, paying-weighted denominator from CPS). */
const PAYING_SIGNUP_QUALITY_SCORE_SUM: QualityScorePackMetricDefinition = {
  name: 'paying_signup_quality_score_sum',
  dimensions: ['channel_id'],
  definition: {
    kind: 'aggregation',
    aggregation: {
      function: 'sum',
      table: 'fact_signup_quality_score',
      column: 'quality_score',
      timeColumn: 'ts',
      filters: [{ field: 'is_paying_customer', operator: '=', value: 'true' }],
    },
  },
};

const PAYING_SIGNUPS_SCORED: QualityScorePackMetricDefinition = {
  name: 'paying_signups_scored',
  dimensions: ['channel_id'],
  definition: {
    kind: 'aggregation',
    aggregation: {
      function: 'count_distinct',
      table: 'fact_signup_quality_score',
      column: 'customer_id',
      timeColumn: 'ts',
      filters: [{ field: 'is_paying_customer', operator: '=', value: 'true' }],
    },
  },
};

/**
 * Reused from the SaaS pack verbatim (not a copy that could drift) — see
 * that pack's own `AD_SPEND` doc comment for why it targets a
 * self-provisioned measure schema rather than a real dbt mart.
 * `ensureQualityScorePackRegistered` (`index.ts`) registers this under its
 * own name, tolerating `DuplicateMetricDefinitionError` the same way
 * `ensureSaasMetricPackRegistered` tolerates a second install attempt — so
 * whichever of the two packs installs first "wins" registering the real
 * metric, and the other's own attempt is a no-op, not a conflict.
 */
const AD_SPEND: QualityScorePackMetricDefinition = (() => {
  const found = SAAS_METRIC_PACK_METRICS.find((metric) => metric.name === 'ad_spend');
  if (!found) {
    throw new Error('quality-score-pack: expected the SaaS pack to declare an "ad_spend" metric to reuse.');
  }
  return { name: found.name, dimensions: found.dimensions, definition: found.definition };
})();

const AVG_SIGNUP_QUALITY_SCORE: QualityScorePackMetricDefinition = {
  name: 'avg_signup_quality_score',
  dimensions: ['channel_id', 'cohort_month'],
  definition: { kind: 'formula', formula: 'signup_quality_score_sum / signups_scored' },
};

/** "Signup-equivalents" weighted by quality — a signup scored 100 counts as 1.0, a signup scored 50 counts as 0.5. `quality_adjusted_cost_per_signup`'s own denominator. */
const QUALITY_WEIGHTED_SIGNUPS: QualityScorePackMetricDefinition = {
  name: 'quality_weighted_signups',
  dimensions: ['channel_id', 'cohort_month'],
  definition: { kind: 'formula', formula: 'signup_quality_score_sum / 100' },
};

/** The paying-only counterpart of {@link QUALITY_WEIGHTED_SIGNUPS} — `quality_adjusted_cac`'s own denominator. */
const QUALITY_WEIGHTED_NEW_PAYING: QualityScorePackMetricDefinition = {
  name: 'quality_weighted_new_paying',
  dimensions: ['channel_id'],
  definition: { kind: 'formula', formula: 'paying_signup_quality_score_sum / 100' },
};

/**
 * The CPS half of KAN-83's "quality-adjusted CAC/CPS" ask (plan `14 §Gap
 * 4`): cost per quality-weighted signup, rather than the SaaS pack's own
 * `cost_per_signup` (`ad_spend / signups`, every signup counted equally
 * regardless of quality).
 */
const QUALITY_ADJUSTED_COST_PER_SIGNUP: QualityScorePackMetricDefinition = {
  name: 'quality_adjusted_cost_per_signup',
  dimensions: ['channel_id'],
  definition: { kind: 'formula', formula: 'ad_spend / quality_weighted_signups' },
};

/**
 * The CAC half: cost per quality-weighted *paying* signup — unlike
 * `quality_adjusted_cost_per_signup`, this only credits a channel for
 * signups that actually became revenue (mirroring the SaaS pack's own
 * `cac` = `ad_spend / new_paying`, `new_paying` being paying-customer-only
 * too), scaled by how high-quality those paying signups were.
 */
const QUALITY_ADJUSTED_CAC: QualityScorePackMetricDefinition = {
  name: 'quality_adjusted_cac',
  dimensions: ['channel_id'],
  definition: { kind: 'formula', formula: 'ad_spend / quality_weighted_new_paying' },
};

/** Phase 1: every aggregation-kind metric (including the reused `ad_spend`) — must all finish registering before phase 2 starts. */
export const QUALITY_SCORE_PACK_AGGREGATION_METRICS: readonly QualityScorePackMetricDefinition[] = [
  SIGNUP_QUALITY_SCORE_SUM,
  SIGNUPS_SCORED,
  PAYING_SIGNUP_QUALITY_SCORE_SUM,
  PAYING_SIGNUPS_SCORED,
  AD_SPEND,
];

/** Phase 2: formula-kind metrics referencing only phase-1 aggregations. */
export const QUALITY_SCORE_PACK_PHASE_2_FORMULA_METRICS: readonly QualityScorePackMetricDefinition[] = [
  AVG_SIGNUP_QUALITY_SCORE,
  QUALITY_WEIGHTED_SIGNUPS,
  QUALITY_WEIGHTED_NEW_PAYING,
];

/** Phase 3: formula-kind metrics referencing phase-2 formulas (plus `ad_spend` from phase 1). */
export const QUALITY_SCORE_PACK_PHASE_3_FORMULA_METRICS: readonly QualityScorePackMetricDefinition[] = [
  QUALITY_ADJUSTED_COST_PER_SIGNUP,
  QUALITY_ADJUSTED_CAC,
];

export const QUALITY_SCORE_PACK_METRICS: readonly QualityScorePackMetricDefinition[] = [
  ...QUALITY_SCORE_PACK_AGGREGATION_METRICS,
  ...QUALITY_SCORE_PACK_PHASE_2_FORMULA_METRICS,
  ...QUALITY_SCORE_PACK_PHASE_3_FORMULA_METRICS,
];
