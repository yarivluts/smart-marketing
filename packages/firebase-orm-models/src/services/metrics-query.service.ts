import { createHash } from 'node:crypto';
import { collectIdentifiers, parseFormula, type CompilerParamValue, type MetricQueryRequest } from '@growthos/shared';
import type { MetricAggregationDef, MetricDefinitionKind } from '../models/metric-def.model';
import { compileMetricQueryForProject } from './metrics-compiler.service';
import { getActiveMetricDefinition, listMetricDefinitionsForProject } from './metric-registry.service';
import { defaultMetricQueryResultCache, type MetricQueryResultCache } from '../warehouse/result-cache';
import { defaultWarehouseQueryExecutor, type WarehouseQueryExecutor, type WarehouseRow } from '../warehouse/query-executor';

/** Default TTL for a cached query result — the plan gives no specific number, so this picks a value short enough that a metric evolving mid-day doesn't stay stale for long, while still absorbing the AC's own "p95 < 1.5s on cached" repeat-request burst (e.g. a dashboard's several tiles re-querying the same window seconds apart). */
export const DEFAULT_METRIC_QUERY_CACHE_TTL_SECONDS = 60;

/**
 * A cache key derived from the project the query runs against plus the two
 * things that determine its result within that project: which metric
 * *versions* it depends on (`definitionRefs`, e.g. `metric:cac@v3`) and the
 * compiled SQL's own bind params (time range, filters) — the plan's own
 * "keyed by def-version+params" AC. `organizationId`/`projectId` are
 * included even though a metric name is already unique within a project:
 * `definitionRefs` is just `metric:<name>@v<version>`, so two different
 * projects each defining their own metric named `cac` at version 3 would
 * otherwise collide on the exact same cache key and one project could read
 * back another's cached result — the cross-tenant leak every other lookup in
 * this codebase (KAN-26) is careful to avoid. Deliberately excludes the
 * compiled SQL text itself: two requests compiling to differently-formatted
 * SQL for the same definitions+params would otherwise miss each other's
 * cache entry for no semantic reason. Including the version in every ref
 * means a metric evolving to a new version naturally misses the old cache
 * entries instead of needing an explicit invalidation step — the previous
 * version's cached entries simply age out via TTL.
 */
function buildResultCacheKey(
  organizationId: string,
  projectId: string,
  definitionRefs: Record<string, string>,
  params: Record<string, CompilerParamValue>,
): string {
  const sortEntries = <T>(record: Record<string, T>) => Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
  const canonical = JSON.stringify({ organizationId, projectId, definitionRefs: sortEntries(definitionRefs), params: sortEntries(params) });
  return createHash('sha256').update(canonical).digest('hex');
}

export interface QueryMetricsParams {
  organizationId: string;
  projectId: string;
  request: MetricQueryRequest;
  /** Defaults to {@link defaultWarehouseQueryExecutor} — overridable so tests can inject a fake executor without a real warehouse. */
  executor?: WarehouseQueryExecutor;
  /** Defaults to {@link defaultMetricQueryResultCache} — overridable per-call for the same reason as `executor`. */
  cache?: MetricQueryResultCache;
  cacheTtlSeconds?: number;
}

export interface MetricQueryResult {
  series: WarehouseRow[];
  /** `metric:<name>@v<version>` per metric the query depends on (requested or transitively referenced by a formula) — see `compileMetricQueryForProject`. */
  definitionRefs: Record<string, string>;
  cacheHit: boolean;
}

/**
 * `POST /v1/metrics/query`'s integration point (KAN-42, plan `13 §E5.3`):
 * resolves + compiles the request via KAN-41's `compileMetricQueryForProject`,
 * serves a cached result when one exists for the same definition
 * versions+params, otherwise executes the compiled SQL via a
 * {@link WarehouseQueryExecutor} and caches the result. Throws whatever
 * `compileMetricQueryForProject` throws (`ProjectNotFoundError`,
 * `MetricNotRegisteredError`, `MetricCompilerError`) for an invalid request,
 * and `WarehouseNotConfiguredError` (from the default executor) once the
 * request is valid but there's no real warehouse to run it against yet.
 */
export async function queryMetrics(params: QueryMetricsParams): Promise<MetricQueryResult> {
  const executor = params.executor ?? defaultWarehouseQueryExecutor;
  const cache = params.cache ?? defaultMetricQueryResultCache;
  const cacheTtlSeconds = params.cacheTtlSeconds ?? DEFAULT_METRIC_QUERY_CACHE_TTL_SECONDS;

  const compiled = await compileMetricQueryForProject({
    organizationId: params.organizationId,
    projectId: params.projectId,
    request: params.request,
  });

  const cacheKey = buildResultCacheKey(params.organizationId, params.projectId, compiled.definitionRefs, compiled.params);
  const cached = cache.get(cacheKey);
  if (cached) {
    return { series: cached, definitionRefs: compiled.definitionRefs, cacheHit: true };
  }

  const series = await executor.execute(compiled);
  cache.set(cacheKey, series, cacheTtlSeconds);
  return { series, definitionRefs: compiled.definitionRefs, cacheHit: false };
}

/** One project's registered metric, as `GET /v1/metrics`'s catalog lists it. */
export interface MetricCatalogEntry {
  name: string;
  version: number;
  definitionKind: MetricDefinitionKind;
  dimensions: string[];
}

/** `GET /v1/metrics` (plan `12 §3`): every metric family's current `active` version in a project — deliberately excludes `superseded` versions, unlike the admin UI's `listMetricDefinitionsForProject` (KAN-40), which browses the full history. */
export async function listMetricsCatalogForProject(organizationId: string, projectId: string): Promise<MetricCatalogEntry[]> {
  const defs = await listMetricDefinitionsForProject(organizationId, projectId);
  return defs
    .filter((def) => def.status === 'active')
    .map((def) => ({ name: def.name, version: def.version, definitionKind: def.definition_kind, dimensions: def.dimensions }));
}

/** `GET /v1/metrics/{name}`'s "definition + lineage" shape — `dependsOn` is the formula's own direct metric references (not transitive; a dashboard/AI caller wanting the full dependency tree can walk it one hop at a time via repeat calls). Empty for an aggregation-kind metric, which depends on no other metric. */
export interface MetricCatalogDetail extends MetricCatalogEntry {
  aggregation?: MetricAggregationDef;
  formula?: string;
  dependsOn: string[];
}

/** `GET /v1/metrics/{name}` (plan `12 §3`): the active version's full definition, or `null` if no metric is registered under that name — the same 404-not-403 non-enumeration posture as every other cross-tenant lookup in this codebase (there's nothing tenant-scoped to leak here, but the shape is kept consistent). */
export async function getMetricCatalogDetail(organizationId: string, projectId: string, name: string): Promise<MetricCatalogDetail | null> {
  const active = await getActiveMetricDefinition(organizationId, projectId, name);
  if (!active) {
    return null;
  }
  const dependsOn = active.definition_kind === 'formula' && active.formula ? [...collectIdentifiers(parseFormula(active.formula))] : [];
  return {
    name: active.name,
    version: active.version,
    definitionKind: active.definition_kind,
    dimensions: active.dimensions,
    ...(active.aggregation ? { aggregation: active.aggregation } : {}),
    ...(active.formula ? { formula: active.formula } : {}),
    dependsOn,
  };
}
