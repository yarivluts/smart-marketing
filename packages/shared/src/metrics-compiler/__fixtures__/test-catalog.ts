import type { CompilerMetricDefinition, MetricCatalog } from '../types';

/**
 * A synthetic metric catalog shared by every golden-file compiler test
 * (`compiler.test.ts`) — a hand-built `MetricCatalog`, not data read from
 * `@growthos/firebase-orm-models` (this package has no dependency on it;
 * see this module's own doc comment for why), loosely modeled on plan
 * `04 §2`'s own example definitions.
 */
export function buildTestCatalog(): MetricCatalog {
  const definitions: CompilerMetricDefinition[] = [
    {
      name: 'ad_spend',
      definitionKind: 'aggregation',
      aggregation: { function: 'sum', table: 'fact_ad_spend', column: 'reporting_spend', timeColumn: 'date', filters: [] },
      dimensions: ['channel', 'campaign', 'geo'],
    },
    {
      name: 'signups',
      definitionKind: 'aggregation',
      aggregation: {
        function: 'count_distinct',
        table: 'fact_funnel_event',
        column: 'customer_id',
        timeColumn: 'ts',
        filters: [{ field: 'step', operator: '=', value: 'signup' }],
      },
      dimensions: ['channel', 'geo'],
    },
    {
      name: 'new_paying',
      definitionKind: 'aggregation',
      aggregation: {
        function: 'count_distinct',
        table: 'fact_revenue_event',
        column: 'customer_id',
        timeColumn: 'ts',
        filters: [{ field: 'type', operator: '=', value: 'first_charge' }],
      },
      dimensions: ['channel', 'plan'],
    },
    {
      name: 'orders',
      definitionKind: 'aggregation',
      aggregation: { function: 'count', table: 'fact_order', timeColumn: 'placed_at', filters: [] },
      dimensions: ['channel'],
    },
    {
      name: 'cost_per_signup',
      definitionKind: 'formula',
      formula: 'ad_spend / signups',
      dimensions: ['channel', 'geo'],
    },
    {
      name: 'cac',
      definitionKind: 'formula',
      formula: 'ad_spend / new_paying',
      dimensions: ['channel'],
    },
    {
      name: 'arpa',
      definitionKind: 'aggregation',
      aggregation: { function: 'avg', table: 'fact_revenue_event', column: 'amount', timeColumn: 'ts', filters: [] },
      dimensions: ['plan'],
    },
    {
      name: 'gross_margin',
      definitionKind: 'aggregation',
      aggregation: { function: 'avg', table: 'fact_revenue_event', column: 'margin_pct', timeColumn: 'ts', filters: [] },
      dimensions: ['plan'],
    },
    {
      name: 'revenue_churn_rate',
      definitionKind: 'aggregation',
      aggregation: { function: 'avg', table: 'dim_subscription', column: 'churn_rate', timeColumn: 'started_at', filters: [] },
      dimensions: ['plan'],
    },
    {
      name: 'ltv',
      definitionKind: 'formula',
      formula: 'arpa * gross_margin / revenue_churn_rate',
      dimensions: ['plan'],
    },
    {
      name: 'ltv_to_cac',
      definitionKind: 'formula',
      formula: 'ltv / cac',
      dimensions: [],
    },
  ];

  return new Map(definitions.map((definition) => [definition.name, definition]));
}
