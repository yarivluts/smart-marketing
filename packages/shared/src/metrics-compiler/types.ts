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
