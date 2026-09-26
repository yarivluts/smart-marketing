import type { MetricUnit } from '@growthos/shared';

/**
 * The unit every built-in pack metric registers with (KAN-213), keyed by metric name. Metric names
 * are unique across packs, and the one name two packs share (`ad_spend`, reused verbatim by the
 * campaign-ops and quality-score packs) has one definition, so one map serves every pack's
 * registration and the backfill for projects that installed a pack before units existed
 * (`backfillBuiltinMetricUnits`).
 *
 * A unit is only declared where the definition makes it certain. A metric left out here stays a
 * plain number, which is how it displayed before units existed:
 *
 * - `ratio` only for a fraction of a subset over its whole, where a value above 1 is not a goal
 *   anyone would set: `lp_conversion_rate`, `failed_charge_rate`, `demo_show_rate`,
 *   `quality_calibration_paying_rate`, `dau_mau_ratio` (dbt computes `dau / active_customers_l_n`,
 *   and the L-N window contains the day), and the two flow rates `conversion_to_paying` and
 *   `trial_conversion_rate` (their numerator and denominator are counted in the same period rather
 *   than as one cohort, so an odd period can read above 100%, but a target above 100% is never
 *   meaningful).
 * - Not a ratio, even though it divides: `roi_*d` and `troi` (a return multiple, routinely above 1),
 *   `net_mrr_churn` (negative when expansion outweighs churn, so the 0-1 range would refuse a real
 *   target), `nps_score` (-100..100, a score and not a percent), and the quality-score averages.
 * - `percent` for `easysign_signing_completion_rate`, whose formula already multiplies by 100.
 * - `currency` (the project's currency) for every money amount and cost-per ratio: spend, MRR and
 *   its movements, collected revenue, gross profit, cost per signup, CAC.
 * - `duration_seconds` for the two support averages whose column is in seconds.
 * - `count` for every count or count_distinct of entities or events, and for sums of pre-counted
 *   visitors/conversions/customers.
 */
export const BUILTIN_METRIC_UNITS: Readonly<Record<string, MetricUnit>> = {
  // saas-metric-pack
  ad_spend: 'currency',
  signups: 'count',
  new_paying: 'count',
  mrr: 'currency',
  mrr_movements: 'currency',
  expansion_mrr: 'currency',
  churned_mrr: 'currency',
  collected_revenue: 'currency',
  total_charges: 'count',
  failed_charges: 'count',
  attributed_gross_profit: 'currency',
  cost_per_signup: 'currency',
  cac: 'currency',
  conversion_to_paying: 'ratio',
  failed_charge_rate: 'ratio',
  reactivations: 'count',
  trial_starts: 'count',
  trial_conversions: 'count',
  trials_active: 'count',
  trial_conversion_rate: 'ratio',

  // landing-page-pack
  lp_visitors: 'count',
  lp_conversions: 'count',
  lp_conversion_rate: 'ratio',

  // engagement-pack
  dau: 'count',
  wau: 'count',
  mau: 'count',
  dau_mau_ratio: 'ratio',
  engagement_depth_histogram: 'count',

  // experiment-pack
  experiment_exposures: 'count',
  experiment_conversions: 'count',

  // feedback-pack
  nps_respondents: 'count',
  nps_promoters: 'count',
  nps_detractors: 'count',

  // firmographic-pack
  firmographic_profiles_total: 'count',
  firmographic_mrr_total: 'currency',

  // churn-reason-pack
  cancellations_total: 'count',

  // quality-score-pack
  signups_scored: 'count',
  paying_signups_scored: 'count',
  quality_adjusted_cost_per_signup: 'currency',
  quality_adjusted_cac: 'currency',

  // campaign-ops-pack
  collection_7d: 'currency',
  collection_14d: 'currency',
  collection_30d: 'currency',
  collection_40d: 'currency',
  quality_calibration_signups: 'count',
  quality_calibration_paying_signups: 'count',
  quality_calibration_collected_revenue_40d: 'currency',
  quality_calibration_matured_signups_40d: 'count',
  quality_calibration_matured_revenue_40d: 'currency',
  quality_calibration_paying_rate: 'ratio',
  quality_calibration_avg_collected_revenue_40d: 'currency',

  // sales-pack
  demos_scheduled: 'count',
  demos_held: 'count',
  demos_no_show: 'count',
  demo_show_rate: 'ratio',

  // support-pack
  support_tickets_opened: 'count',
  support_tickets_resolved: 'count',
  support_avg_first_response_seconds: 'duration_seconds',
  support_avg_resolution_seconds: 'duration_seconds',
  support_open_backlog: 'count',

  // easysign
  easysign_documents_created: 'count',
  easysign_signings_viewed: 'count',
  easysign_documents_signed: 'count',
  easysign_documents_declined: 'count',
  easysign_signing_completion_rate: 'percent',
};

/** The unit a built-in pack metric registers with, or `undefined` when it has none. */
export function builtinMetricUnit(metricName: string): MetricUnit | undefined {
  return Object.prototype.hasOwnProperty.call(BUILTIN_METRIC_UNITS, metricName) ? BUILTIN_METRIC_UNITS[metricName] : undefined;
}
