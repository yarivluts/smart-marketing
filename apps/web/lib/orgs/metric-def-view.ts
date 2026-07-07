import type { MetricAggregationDef, MetricDefinitionKind, MetricDefModel, MetricDefStatus } from '@growthos/firebase-orm-models';

export interface MetricDefView {
  id: string;
  name: string;
  version: number;
  status: MetricDefStatus;
  definitionKind: MetricDefinitionKind;
  aggregation: MetricAggregationDef | null;
  formula: string | null;
  dimensions: string[];
  createdBy: string;
  createdAt: string;
}

/**
 * A `MetricDefModel` instance doesn't serialize cleanly through
 * `NextResponse.json` (its `id` and other fields are backed by getters, the
 * same reason `toSchemaDefView` maps `SchemaDefModel` instead of returning
 * them raw). Shared by the register/evolve/list metric-def routes.
 */
export function toMetricDefView(metricDef: MetricDefModel): MetricDefView {
  return {
    id: metricDef.id,
    name: metricDef.name,
    version: metricDef.version,
    status: metricDef.status,
    definitionKind: metricDef.definition_kind,
    aggregation: metricDef.aggregation ?? null,
    formula: metricDef.formula ?? null,
    dimensions: metricDef.dimensions,
    createdBy: metricDef.created_by,
    createdAt: metricDef.created_at,
  };
}
