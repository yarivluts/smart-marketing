import type { MetricDefinitionInput } from '../../services/metric-registry.service';

/**
 * The Churn Reasons metric pack (KAN-84, plan `14 §Gap 10`: "churn-reason
 * breakdown joined to plan/channel/cohort"). Targets `fact_churn_reason` —
 * a new dbt core mart (`packages/dbt-transform/dbt/models/core/
 * fact_churn_reason.sql`) that flattens a `churn_reason` event's JSON
 * `properties.category`/`properties.reason_text` into real columns and
 * joins in the customer's own acquisition channel (`fact_attribution`,
 * first-touch), current subscription plan (`dim_subscription.plan_interval`,
 * aliased `plan` — the same "plan" vocabulary `fact_revenue_event.plan`
 * already established), and signup cohort month (the same per-customer
 * cohort assignment `fact_cohort_retention` computes). `churn_events` is a
 * plain `count`-function aggregation with all four as declared breakdown
 * dimensions — a project's own Boards then deliver the gap doc's "reason X
 * is 3x more common in accounts from TikTok" report via the ordinary
 * metric-picker + dimension-breakdown UI (KAN-60) any other metric already
 * uses, rather than a bespoke report page. The AI-clustered *theme* digest
 * (blending `category` with free-text inference for anything `other`) is a
 * separate, Firestore-side read (`getChurnReasonThemeDigestForProject`) —
 * the metrics compiler only ever emits bare column references against a
 * mart's own flat columns (no generic clustering at query time), so this
 * metric's own `category` breakdown is the *structured* half of "structured
 * + free text", not the clustered one.
 */
export interface ChurnReasonPackMetricDefinition {
  name: string;
  dimensions: readonly string[];
  definition: MetricDefinitionInput;
}

const CHURN_EVENTS: ChurnReasonPackMetricDefinition = {
  name: 'churn_events',
  dimensions: ['category', 'channel_id', 'plan', 'cohort_month'],
  definition: {
    kind: 'aggregation',
    aggregation: { function: 'count', table: 'fact_churn_reason', timeColumn: 'ts', filters: [] },
  },
};

export const CHURN_REASON_PACK_METRICS: readonly ChurnReasonPackMetricDefinition[] = [CHURN_EVENTS];
