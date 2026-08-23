import type { MetricDefinitionInput } from '../../services/metric-registry.service';

export interface ChurnReasonPackMetricDefinition {
  name: string;
  dimensions: readonly string[];
  definition: MetricDefinitionInput;
}

/**
 * The Churn Reason pack's single metric (KAN-84, plan `14 §Gap 10`),
 * mirroring the SaaS pack's `mrr` metric's own `dimensions: ['plan_interval']`
 * precedent for a breakdown-capable aggregation. Targets `fact_cancellation_reason`
 * — a new dbt core mart (`packages/dbt-transform/dbt/models/core/
 * fact_cancellation_reason.sql`) that flattens a `cancellation_reason`
 * event's JSON `properties.reason_code`/`properties.comment` into real
 * columns and joins each cancellation to the customer's current
 * subscription plan, last-touch marketing channel, and signup cohort month
 * — the plan/channel/cohort breakdown axes the AC names. `dimensions` here
 * must exactly match real columns on that mart (the compiler has no
 * schema-level validation for a dimension name — see `saas-metric-pack/
 * saas-metric-pack.emulator.test.ts`'s own regression comment on this class
 * of bug). `count` (a plain row count, not `count_distinct`) — every
 * landed cancellation reason counts once, even a customer who cancels more
 * than one subscription over time.
 */
const CANCELLATIONS_TOTAL: ChurnReasonPackMetricDefinition = {
  name: 'cancellations_total',
  dimensions: ['reason_code', 'plan_interval', 'channel_id', 'cohort_month'],
  definition: {
    kind: 'aggregation',
    aggregation: {
      function: 'count',
      table: 'fact_cancellation_reason',
      timeColumn: 'ts',
      filters: [],
    },
  },
};

export const CHURN_REASON_PACK_METRICS: readonly ChurnReasonPackMetricDefinition[] = [CANCELLATIONS_TOTAL];
