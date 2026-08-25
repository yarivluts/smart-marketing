import type { MetricDefinitionInput } from '../../services/metric-registry.service';

export interface SupportPackMetricDefinition {
  name: string;
  dimensions: readonly string[];
  definition: MetricDefinitionInput;
}

const TABLE = 'fact_support_ticket_event';

function stageFilter(stage: 'opened' | 'resolved') {
  return [{ field: 'stage', operator: '=' as const, value: stage }];
}

/**
 * `support_tickets_opened` has no `agent_org_person_id` dimension —
 * `agent_org_person_id` is typically still null on an `opened`-stage event
 * (unassigned backlog), see `SUPPORT_TICKET_SCHEMA_FIELDS`'s own doc
 * comment, so breaking this one down by agent wouldn't be meaningful.
 */
const SUPPORT_TICKETS_OPENED: SupportPackMetricDefinition = {
  name: 'support_tickets_opened',
  dimensions: [],
  definition: {
    kind: 'aggregation',
    aggregation: { function: 'count_distinct', table: TABLE, column: 'ticket_id', timeColumn: 'ts', filters: stageFilter('opened') },
  },
};

const SUPPORT_TICKETS_RESOLVED: SupportPackMetricDefinition = {
  name: 'support_tickets_resolved',
  dimensions: ['agent_org_person_id'],
  definition: {
    kind: 'aggregation',
    aggregation: { function: 'count_distinct', table: TABLE, column: 'ticket_id', timeColumn: 'ts', filters: stageFilter('resolved') },
  },
};

const SUPPORT_AVG_FIRST_RESPONSE_SECONDS: SupportPackMetricDefinition = {
  name: 'support_avg_first_response_seconds',
  dimensions: ['agent_org_person_id'],
  definition: {
    kind: 'aggregation',
    aggregation: { function: 'avg', table: TABLE, column: 'first_response_seconds', timeColumn: 'ts', filters: stageFilter('resolved') },
  },
};

const SUPPORT_AVG_RESOLUTION_SECONDS: SupportPackMetricDefinition = {
  name: 'support_avg_resolution_seconds',
  dimensions: ['agent_org_person_id'],
  definition: {
    kind: 'aggregation',
    aggregation: { function: 'avg', table: TABLE, column: 'resolution_seconds', timeColumn: 'ts', filters: stageFilter('resolved') },
  },
};

const SUPPORT_AVG_CSAT_SCORE: SupportPackMetricDefinition = {
  name: 'support_avg_csat_score',
  dimensions: ['agent_org_person_id'],
  definition: {
    kind: 'aggregation',
    aggregation: { function: 'avg', table: TABLE, column: 'csat_score', timeColumn: 'ts', filters: stageFilter('resolved') },
  },
};

/** Phase 1 (aggregations): must all finish registering before the phase-2 formula below, same ordering `CAMPAIGN_OPS_PACK_CALIBRATION_AGGREGATION_METRICS` establishes. */
export const SUPPORT_PACK_AGGREGATION_METRICS: readonly SupportPackMetricDefinition[] = [
  SUPPORT_TICKETS_OPENED,
  SUPPORT_TICKETS_RESOLVED,
  SUPPORT_AVG_FIRST_RESPONSE_SECONDS,
  SUPPORT_AVG_RESOLUTION_SECONDS,
  SUPPORT_AVG_CSAT_SCORE,
];

/**
 * The undimensioned open-ticket backlog — a formula can't be broken down
 * directly by the compiler (same reasoning `nps_score`/
 * `quality_calibration_paying_rate` document for their own formula
 * metrics), so `dimensions: []` even though one of its two referenced
 * aggregations declares its own.
 *
 * Unlike `SupportLeaderboardResult.openBacklog` (`support.service.ts`),
 * this formula has no `Math.max(0, ...)` floor — the metrics-compiler
 * formula parser (`packages/shared/src/metrics-compiler/formula-parser.ts`)
 * only supports `+`/`-`/`*`/`/`, no clamp/greatest function — so a period
 * whose `support_tickets_resolved` exceeds its `support_tickets_opened`
 * (a `resolved` event landing for a ticket whose `opened` event fell
 * outside the requested time window, or was never sent — the same
 * connector-backfill-gap case that function's own doc comment names) can
 * render a negative backlog here, on a board tile or goal, even though the
 * project's own Support admin page (which reads the clamped service
 * function directly) never shows one for the same underlying data. A
 * known, documented compiler-shape limitation, not a bug in this metric.
 */
const SUPPORT_OPEN_BACKLOG: SupportPackMetricDefinition = {
  name: 'support_open_backlog',
  dimensions: [],
  definition: { kind: 'formula', formula: 'support_tickets_opened - support_tickets_resolved' },
};

/** Phase 2 (formula): references only the phase-1 aggregations above. */
export const SUPPORT_PACK_FORMULA_METRICS: readonly SupportPackMetricDefinition[] = [SUPPORT_OPEN_BACKLOG];

export const SUPPORT_PACK_METRICS: readonly SupportPackMetricDefinition[] = [...SUPPORT_PACK_AGGREGATION_METRICS, ...SUPPORT_PACK_FORMULA_METRICS];
