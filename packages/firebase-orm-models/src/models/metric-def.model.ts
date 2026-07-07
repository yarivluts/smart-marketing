import { BaseModel, Field, Model } from '@arbel/firebase-orm';

/**
 * `active`: the current version compilers/dashboards should read.
 * `superseded`: an earlier version, kept (never deleted or mutated) so
 * historical dashboards can still pin a specific version (plan `04 §7`:
 * "changing a definition is tracked, and historical dashboards can pin a
 * version") — the same "immutable version history" shape KAN-31's
 * `SchemaDefModel` already established for schema versions.
 */
export const METRIC_DEF_STATUSES = ['active', 'superseded'] as const;
export type MetricDefStatus = (typeof METRIC_DEF_STATUSES)[number];

/** How a metric's value is computed (plan `04 §2`): either a raw aggregation over a warehouse table, or an arithmetic formula over other metrics' own values. */
export const METRIC_DEFINITION_KINDS = ['aggregation', 'formula'] as const;
export type MetricDefinitionKind = (typeof METRIC_DEFINITION_KINDS)[number];

export function isMetricDefinitionKind(value: string): value is MetricDefinitionKind {
  return (METRIC_DEFINITION_KINDS as readonly string[]).includes(value);
}

/** Aggregation function vocabulary an `aggregation`-kind metric may declare (plan `04 §2`'s `sum`/`count_distinct` examples, generalized). */
export const METRIC_AGG_FUNCTIONS = ['sum', 'count', 'count_distinct', 'avg', 'min', 'max'] as const;
export type MetricAggFunction = (typeof METRIC_AGG_FUNCTIONS)[number];

export function isMetricAggFunction(value: string): value is MetricAggFunction {
  return (METRIC_AGG_FUNCTIONS as readonly string[]).includes(value);
}

/** Comparison operator vocabulary a metric's base filters may declare (plan `04 §2`'s `where step='signup'` example, generalized to a structured filter). */
export const METRIC_FILTER_OPERATORS = ['=', '!=', '>', '>=', '<', '<=', 'in'] as const;
export type MetricFilterOperator = (typeof METRIC_FILTER_OPERATORS)[number];

export function isMetricFilterOperator(value: string): value is MetricFilterOperator {
  return (METRIC_FILTER_OPERATORS as readonly string[]).includes(value);
}

/** One base filter restricting the rows an aggregation sums/counts over, e.g. `step = 'signup'`. */
export interface MetricFilterDef {
  field: string;
  operator: MetricFilterOperator;
  value: string;
}

/** The `agg` half of plan `04 §2`'s example, e.g. `count_distinct(fact_funnel_event.customer_id where step='signup')`. */
export interface MetricAggregationDef {
  function: MetricAggFunction;
  table: string;
  /** Required for every function except `count` (a plain row count needs no column). */
  column?: string;
  /** The table's own date/timestamp column (plan `04 §1`'s tables don't share one name — `fact_ad_spend.date`, `fact_funnel_event.ts`, ...) — the compiler (KAN-41) buckets by this column for a query's requested time grain. */
  timeColumn: string;
  filters: MetricFilterDef[];
}

/**
 * One versioned definition of a metric, scoped to a project (plan `04 §2`:
 * "every metric is defined once as config ... compiled to warehouse SQL, and
 * consumed by dashboards, the Metrics API, and the AI"). A metric "family" is
 * identified by `(project_id, name)`; each evolution creates a brand-new
 * document rather than mutating an existing one, so every past version stays
 * queryable — see `metric-registry.service.ts` for validation rules.
 *
 * Exactly one of `aggregation`/`formula` is set, matching `definition_kind`.
 * Modeled as two optional fields rather than a discriminated-union field
 * (mirroring `SchemaDefModel`'s own flat-fields convention) since
 * `@arbel/firebase-orm`'s `@Field` decorator stores per-class field metadata
 * that a nested union type doesn't map onto cleanly.
 */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/metric_defs',
  path_id: 'metric_def_id',
})
export class MetricDefModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  /** The metric's key, e.g. `cac` — unique within a project, unversioned (a family has no `kind` the way `SchemaDefModel` does). */
  @Field({ is_required: true, is_text_indexing: true })
  public name!: string;

  @Field({ is_required: true })
  public version!: number;

  @Field({ is_required: true })
  public status!: MetricDefStatus;

  @Field({ is_required: true })
  public definition_kind!: MetricDefinitionKind;

  @Field({ is_required: false })
  public aggregation?: MetricAggregationDef;

  /** An arithmetic expression over other metrics' names, e.g. `ad_spend / signups` (plan `04 §2`'s `formula` examples). Set only when `definition_kind === 'formula'`. */
  @Field({ is_required: false })
  public formula?: string;

  /** Dimensions this metric can be broken down by, e.g. `channel`, `campaign` (plan `04 §2`). */
  @Field({ is_required: true })
  public dimensions!: string[];

  @Field({ is_required: true })
  public created_by!: string;

  @Field({ is_required: true })
  public created_at!: string;
}
