import type { MetricAggregationInput, MetricDefinitionInput } from '../../services/metric-registry.service';

export interface ExperimentPackMetricDefinition {
  name: string;
  dimensions: readonly string[];
  definition: MetricDefinitionInput;
}

/**
 * `experiment_exposures`/`experiment_conversions` share this exact shape —
 * a distinct-customer count over `fact_experiment_event`, filtered to one
 * of that mart's own `event_type` values (`experiment_exposure` vs
 * `experiment_conversion`) — `count_distinct` rather than a plain row
 * count so a visitor who somehow fires the same exposure/conversion call
 * twice (a page reload, a retried request) is still counted once, the same
 * "one distinct customer, however many times they fired the event"
 * reasoning the Engagement pack's own `ACTIVE_CUSTOMERS_AGGREGATION`
 * establishes for DAU/WAU/MAU. Both declare `dimensions: ['experiment_key',
 * 'variant_key']` — `getExperimentResultsForProject` queries both grouped
 * by those two dimensions and joins the resulting per-(experiment, variant)
 * counts in TypeScript (`computeExperimentResult`, `@growthos/shared`)
 * rather than the compiler, which has no per-variant ratio/join support.
 */
function experimentEventCountAggregation(eventType: 'experiment_exposure' | 'experiment_conversion'): MetricAggregationInput {
  return {
    function: 'count_distinct',
    table: 'fact_experiment_event',
    column: 'customer_id',
    timeColumn: 'ts',
    filters: [{ field: 'event_type', operator: '=', value: eventType }],
  };
}

const EXPERIMENT_EXPOSURES: ExperimentPackMetricDefinition = {
  name: 'experiment_exposures',
  dimensions: ['experiment_key', 'variant_key'],
  definition: { kind: 'aggregation', aggregation: experimentEventCountAggregation('experiment_exposure') },
};

const EXPERIMENT_CONVERSIONS: ExperimentPackMetricDefinition = {
  name: 'experiment_conversions',
  dimensions: ['experiment_key', 'variant_key'],
  definition: { kind: 'aggregation', aggregation: experimentEventCountAggregation('experiment_conversion') },
};

export const EXPERIMENT_PACK_METRICS: readonly ExperimentPackMetricDefinition[] = [EXPERIMENT_EXPOSURES, EXPERIMENT_CONVERSIONS];
