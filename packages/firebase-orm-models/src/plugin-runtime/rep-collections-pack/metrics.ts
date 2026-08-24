import type { MetricDefinitionInput } from '../../services/metric-registry.service';

export interface RepCollectionsPackMetricDefinition {
  name: string;
  dimensions: readonly string[];
  definition: MetricDefinitionInput;
}

/**
 * `collected_revenue_by_customer` — succeeded charges summed per customer,
 * the dollars this pack attributes to whichever rep owns that customer.
 *
 * Filters on `type = 'charge'` as well as `status = 'succeeded'`:
 * `fact_revenue_event` emits a second, synthetic `first_charge` row
 * alongside a customer's first succeeded `charge` row for the exact same
 * amount (see that model's own doc comment), so filtering on status alone
 * would double-count every customer's very first payment — and unevenly
 * across reps, since the inflation scales with each rep's new-customer
 * count, corrupting the leaderboard *ranking* and not just its magnitudes.
 * `fact_customer_payback.sql`'s own doc comment documents this exact trap
 * for the same table. (The SaaS pack's `collected_revenue` omits the `type`
 * filter and so carries this flaw; correcting that pre-existing metric is
 * out of this story's scope — it would silently restate an already-shipped
 * board figure.)
 *
 * Lives here as a new metric rather than an evolution of the SaaS pack's
 * `collected_revenue` because that one declares no `customer_id` dimension
 * — see `rep-collections.service.ts`'s own doc comment.
 */
export const REP_COLLECTIONS_PACK_METRICS: readonly RepCollectionsPackMetricDefinition[] = [
  {
    name: 'collected_revenue_by_customer',
    dimensions: ['customer_id'],
    definition: {
      kind: 'aggregation',
      aggregation: {
        function: 'sum',
        table: 'fact_revenue_event',
        column: 'amount',
        timeColumn: 'ts',
        filters: [
          { field: 'status', operator: '=', value: 'succeeded' },
          { field: 'type', operator: '=', value: 'charge' },
        ],
      },
    },
  },
];
