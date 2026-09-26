/**
 * Types for the metric compiler (KAN-41, plan `04 §2`/`13 §E5.2`): pure,
 * Firestore-free — it consumes an already-resolved catalog of metric
 * definitions (the shape `MetricDefModel` in `@growthos/firebase-orm-models`
 * projects onto) and a query request, and emits BigQuery SQL + bind params.
 * Kept independent of any specific ORM model type so it can be unit-tested
 * with plain fixtures and reused by any future caller (KAN-42's query API,
 * the AI Analyst's `query_metric` tool, ...).
 */

export const METRIC_AGG_FUNCTIONS = ['sum', 'count', 'count_distinct', 'avg', 'min', 'max'] as const;
export type MetricAggFunction = (typeof METRIC_AGG_FUNCTIONS)[number];

export const METRIC_FILTER_OPERATORS = ['=', '!=', '>', '>=', '<', '<=', 'in'] as const;
export type MetricFilterOperator = (typeof METRIC_FILTER_OPERATORS)[number];

/** One filter clause. For `in`, `value` is a comma-separated list (e.g. `"google,meta,tiktok"`) — the only shape `MetricFilterDef`'s single `value: string` field supports today. */
export interface CompilerFilter {
  field: string;
  operator: MetricFilterOperator;
  value: string;
}

export interface CompilerAggregationDef {
  function: MetricAggFunction;
  table: string;
  /** Required for every function except `count` (a plain row count needs no column). */
  column?: string;
  /** The table's own date/timestamp column the compiler buckets by. */
  timeColumn: string;
  filters: readonly CompilerFilter[];
}

export type CompilerDefinitionKind = 'aggregation' | 'formula';

/**
 * One resolved metric, keyed by name in a `MetricCatalog`. Exactly one of
 * `aggregation`/`formula` is set, matching `definitionKind` — mirrors
 * `MetricDefModel`'s own shape (see KAN-40) without depending on it.
 */
export interface CompilerMetricDefinition {
  name: string;
  definitionKind: CompilerDefinitionKind;
  aggregation?: CompilerAggregationDef;
  /** An arithmetic expression over other metrics' names, e.g. `ad_spend / signups`. Set only when `definitionKind === 'formula'`. */
  formula?: string;
  /** Dimensions this metric can be broken down by — a query may only request a breakdown that's a subset of this list. */
  dimensions: readonly string[];
}

export type MetricCatalog = ReadonlyMap<string, CompilerMetricDefinition>;

/** The calendar grains a board or chart buckets a range by - the grains a human picks from. */
export const TIME_GRAINS = ['day', 'week', 'month', 'quarter', 'year'] as const;
export type TimeGrain = (typeof TIME_GRAINS)[number];

/**
 * The whole requested range as ONE bucket (per compared period), stamped with the range's start
 * date. This is how a period's value is computed - a big number, a goal's actual, a
 * period-over-period change - because it is the only correct way for a metric that is not a plain
 * count or sum.
 *
 * A formula metric is composed from its aggregation operands inside the query, so over a single
 * bucket `conversions / visitors` evaluates as sum(conversions) / sum(visitors) across the whole
 * range. Deriving the same number from a per-day series instead is the average-of-ratios fallacy:
 * day 1 at 1/1 (100%) and day 2 at 1/100 (1%) average to 50.5%, while the period's real rate is
 * 2/101 = 1.98%. The same holds for avg/min/max (the mean of daily means weights a quiet day like a
 * busy one) and for count_distinct (a customer active on two days is one customer, not two). For a
 * count or a sum the single bucket equals the sum of the daily buckets, so nothing changes there.
 *
 * Not a calendar grain, so it is not in {@link TIME_GRAINS}: a board's own grain picker never
 * offers it. It is a query grain only - see {@link METRIC_QUERY_GRAINS}.
 */
export const TOTAL_GRAIN = 'total' as const;

/** Every grain a metric query accepts: the calendar grains plus {@link TOTAL_GRAIN}. */
export const METRIC_QUERY_GRAINS = [...TIME_GRAINS, TOTAL_GRAIN] as const;
export type MetricQueryGrain = (typeof METRIC_QUERY_GRAINS)[number];

export const COMPARE_PERIODS = ['previous_period', 'previous_year'] as const;
export type ComparePeriod = (typeof COMPARE_PERIODS)[number];

export interface MetricQueryTimeRange {
  /** Inclusive, `YYYY-MM-DD`. */
  start: string;
  /** Inclusive, `YYYY-MM-DD`. */
  end: string;
  /** A calendar grain buckets the range; {@link TOTAL_GRAIN} returns the whole range as one bucket (a period value). */
  grain: MetricQueryGrain;
  compare?: ComparePeriod;
}

export interface MetricQueryRequest {
  /** One or more metric names — every name must exist in the catalog passed to `compileMetricQuery`. */
  metrics: readonly string[];
  /** Breakdown dimensions — each must be declared on every requested metric's own `dimensions` list. */
  dimensions?: readonly string[];
  /** Applied identically to every underlying aggregation, in addition to that aggregation's own base filters. */
  filters?: readonly CompilerFilter[];
  time: MetricQueryTimeRange;
}

/**
 * The requesting org/project, compiled into every leaf aggregation's
 * `WHERE` clause as `organization_id = @tenant_org AND project_id =
 * @tenant_project` (KAN-18 tenant-isolation fix). Every dbt-built core/fact
 * table carries both columns; without this, a single shared BigQuery
 * warehouse would sum every tenant's rows together. Deliberately a
 * *separate* parameter to `compileMetricQuery`, not a field on
 * `MetricQueryRequest` — `MetricQueryRequest` is the caller-supplied query
 * shape (ultimately deserialized from an HTTP body in `apps/api`'s
 * `POST /metrics/query`), and tenant identity must come only from the
 * caller's own trusted session/API-key context, never from request input.
 *
 * Found during the KAN-18 warehouse-integration scoping (2026-08-18) —
 * never actually exploitable in production, since every environment has
 * only ever queried `NotConfiguredWarehouseQueryExecutor` (a real BigQuery
 * executor has never gone live), but must be fixed before one does.
 */
export interface CompilerTenant {
  organizationId: string;
  projectId: string;
  /**
   * The one environment this query counts rows from, compiled as an
   * additional `environment_id = @tenant_environment_id` predicate — every
   * dbt-built core/fact table carries the column in its grain. Without it, a
   * project holding both a test-mode (`gos_test_`, dev/staging) and a
   * live-mode (`gos_live_`, prod) ingest key would blend test traffic into
   * its production board numbers (found via session-B dogfooding QA the day
   * the real warehouse went live, 2026-08-19). Same trusted-context-only
   * posture as the org/project fields above: an API-key caller gets its
   * key's own bound environment, a human-session caller gets the project's
   * `prod` environment resolved server-side — never caller-supplied input.
   * Optional because unit fixtures and any not-yet-migrated caller may omit
   * it; production callers should always set it.
   */
  environmentId?: string;
}

/** A bind-parameter value — an array only ever backs an `in` filter's `IN UNNEST(@param)`. */
export type CompilerParamValue = string | readonly string[];

export interface CompiledMetricQuery {
  sql: string;
  params: Record<string, CompilerParamValue>;
}

export class MetricCompilerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MetricCompilerError';
  }
}
