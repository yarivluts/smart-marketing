import type { MetricDefinitionInput } from '../../services/metric-registry.service';

export interface SalesPackMetricDefinition {
  name: string;
  dimensions: readonly string[];
  definition: MetricDefinitionInput;
}

const TABLE = 'fact_demo_event';

function stageFilter(stage: 'scheduled' | 'held' | 'no_show') {
  return [{ field: 'stage', operator: '=' as const, value: stage }];
}

const DEMOS_SCHEDULED: SalesPackMetricDefinition = {
  name: 'demos_scheduled',
  dimensions: ['rep_org_person_id'],
  definition: {
    kind: 'aggregation',
    aggregation: { function: 'count_distinct', table: TABLE, column: 'demo_id', timeColumn: 'ts', filters: stageFilter('scheduled') },
  },
};

const DEMOS_HELD: SalesPackMetricDefinition = {
  name: 'demos_held',
  dimensions: ['rep_org_person_id'],
  definition: {
    kind: 'aggregation',
    aggregation: { function: 'count_distinct', table: TABLE, column: 'demo_id', timeColumn: 'ts', filters: stageFilter('held') },
  },
};

const DEMOS_NO_SHOW: SalesPackMetricDefinition = {
  name: 'demos_no_show',
  dimensions: ['rep_org_person_id'],
  definition: {
    kind: 'aggregation',
    aggregation: { function: 'count_distinct', table: TABLE, column: 'demo_id', timeColumn: 'ts', filters: stageFilter('no_show') },
  },
};

/** Phase 1 (aggregations): must all finish registering before the phase-2 formula below, same ordering `SUPPORT_PACK_AGGREGATION_METRICS` establishes. */
export const SALES_PACK_AGGREGATION_METRICS: readonly SalesPackMetricDefinition[] = [DEMOS_SCHEDULED, DEMOS_HELD, DEMOS_NO_SHOW];

/**
 * The demo show rate — a formula can't be broken down directly by the
 * compiler (same reasoning `support_open_backlog`/`nps_score` document for
 * their own formula metrics), so `dimensions: []` even though every
 * aggregation it references declares its own.
 */
const DEMO_SHOW_RATE: SalesPackMetricDefinition = {
  name: 'demo_show_rate',
  dimensions: [],
  definition: { kind: 'formula', formula: 'demos_held / (demos_held + demos_no_show)' },
};

/** Phase 2 (formula): references only the phase-1 aggregations above. */
export const SALES_PACK_FORMULA_METRICS: readonly SalesPackMetricDefinition[] = [DEMO_SHOW_RATE];

export const SALES_PACK_METRICS: readonly SalesPackMetricDefinition[] = [...SALES_PACK_AGGREGATION_METRICS, ...SALES_PACK_FORMULA_METRICS];
