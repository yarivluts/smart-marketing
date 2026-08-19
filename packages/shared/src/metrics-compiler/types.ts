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

export const TIME_GRAINS = ['day', 'week', 'month', 'quarter', 'year'] as const;
export type TimeGrain = (typeof TIME_GRAINS)[number];

export const COMPARE_PERIODS = ['previous_period', 'previous_year'] as const;
export type ComparePeriod = (typeof COMPARE_PERIODS)[number];

export interface MetricQueryTimeRange {
  /** Inclusive, `YYYY-MM-DD`. */
  start: string;
  /** Inclusive, `YYYY-MM-DD`. */
  end: string;
  grain: TimeGrain;
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
