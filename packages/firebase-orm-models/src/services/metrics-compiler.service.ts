import {
  collectIdentifiers,
  compileMetricQuery,
  parseFormula,
  type CompiledMetricQuery,
  type CompilerMetricDefinition,
  type MetricCatalog,
  type MetricQueryRequest,
} from '@growthos/shared';
import { ProjectModel } from '../models/project.model';
import { MetricDefModel } from '../models/metric-def.model';
import { getActiveMetricDefinition } from './metric-registry.service';
import { listSchemaDefinitionsForProject } from './schema-registry.service';
import { martViewName } from '../warehouse/schema-mart';
import { ProjectNotFoundError } from './resource-library.service';

export class MetricNotRegisteredError extends Error {
  constructor(public readonly names: readonly string[]) {
    super(`The following metrics have no active version in this project: ${names.join(', ')}.`);
    this.name = 'MetricNotRegisteredError';
  }
}

/**
 * Warehouse tables plan `04 §1` documents as canonical schema but that no
 * dbt core model actually builds. Empty as of the 2026-08-21 follow-up that
 * built real `fact_funnel_event`/`fact_revenue_event`/`dim_subscription`/
 * `fact_subscription_event` core models (`packages/dbt-transform`) — every
 * SaaS/Engagement-pack metric that used to target one of those four now
 * resolves against a real relation, so nothing is currently known-aspirational.
 * Left in place (rather than deleted along with the now-empty set) because
 * the mechanism itself is still real infrastructure: a future metric pack
 * can add its own genuinely-not-yet-built table name here to get the same
 * clean `not_yet_backed` degrade (`MetricTargetsUnbuiltWarehouseTableError`
 * below) instead of a raw `WarehouseQueryFailedError` "table not found" once
 * the real warehouse is live, the same way `ad_spend`
 * (`saas-metric-pack/schemas.ts`) and now these four tables graduated out of
 * this set rather than needing it deleted and rebuilt from scratch.
 *
 * A metric whose (possibly mart-view-mapped, see `mapCustomSchemaTables`)
 * aggregation targets an entry here can never succeed against a real
 * warehouse today, no matter how well-formed the compiled query is — see
 * {@link CompiledProjectMetricQuery.unbuiltWarehouseTables}, which callers
 * that actually execute a query (`queryMetrics`) use to fail fast, *before*
 * spending a warehouse round trip (and a KAN-39 cost-quota slot) on a query
 * that's certain to come back "table not found". Deliberately reported
 * rather than thrown here: `compileMetricQueryForProject` itself stays a
 * pure "resolve + compile" step whose success doesn't depend on whether the
 * real warehouse happens to have caught up yet — only a caller that's about
 * to actually run the query needs to care. A maintained allowlist, not a
 * generic "does this table exist in the warehouse" check: nothing in this
 * codebase inspects the real warehouse's live schema at compile time
 * (KAN-18's own buildable-today posture), so this only ever answers for the
 * specific tables this codebase already knows are aspirational-only — a
 * metric targeting some other, genuinely-missing table still surfaces as the
 * existing `WarehouseQueryFailedError` degrade, just one warehouse round
 * trip later.
 */
export const KNOWN_UNBUILT_WAREHOUSE_TABLES = new Set<string>([]);

/** One metric (by name) whose aggregation targets a table in {@link KNOWN_UNBUILT_WAREHOUSE_TABLES}. */
export interface UnbuiltWarehouseTableRef {
  metricName: string;
  table: string;
}

/** Thrown by execution-layer callers of `compileMetricQueryForProject` (e.g. `queryMetrics`) when the compiled query targets a table in {@link KNOWN_UNBUILT_WAREHOUSE_TABLES} — see that constant's own doc comment. */
export class MetricTargetsUnbuiltWarehouseTableError extends Error {
  constructor(public readonly metricName: string, public readonly table: string) {
    super(`Metric "${metricName}" targets warehouse table "${table}", which the warehouse pipeline doesn't build yet.`);
    this.name = 'MetricTargetsUnbuiltWarehouseTableError';
  }
}

/** Every aggregation-kind entry in `catalog` (deterministic resolution order) whose table is in {@link KNOWN_UNBUILT_WAREHOUSE_TABLES} — called with the already mart-view-mapped catalog, so a human who self-provisions a measure/entity schema literally named e.g. `dim_subscription` correctly stops matching (its table is rewritten to a real mart view name before this runs). */
function collectUnbuiltWarehouseTables(catalog: MetricCatalog): UnbuiltWarehouseTableRef[] {
  const refs: UnbuiltWarehouseTableRef[] = [];
  for (const [name, definition] of catalog) {
    if (definition.aggregation && KNOWN_UNBUILT_WAREHOUSE_TABLES.has(definition.aggregation.table)) {
      refs.push({ metricName: name, table: definition.aggregation.table });
    }
  }
  return refs;
}

async function requireProjectInOrg(organizationId: string, projectId: string): Promise<ProjectModel> {
  const project = await ProjectModel.init(projectId, { organization_id: organizationId });
  if (!project || project.organization_id !== organizationId) {
    throw new ProjectNotFoundError();
  }
  return project;
}

function toCompilerDefinition(metricDef: MetricDefModel): CompilerMetricDefinition {
  return {
    name: metricDef.name,
    definitionKind: metricDef.definition_kind,
    aggregation: metricDef.aggregation,
    formula: metricDef.formula,
    dimensions: metricDef.dimensions,
  };
}

interface ResolvedCatalog {
  catalog: MetricCatalog;
  /** `metric:<name>@v<version>` per resolved name — carried alongside the catalog since `CompilerMetricDefinition` itself is deliberately version-agnostic (it's a pure compiler input type, shared by any caller). */
  definitionRefs: Record<string, string>;
}

/**
 * Fetches the active version of every requested metric and, for any that
 * are formulas, recursively every metric they (transitively) reference —
 * the exact catalog `compileMetricQuery` needs to inline nested formulas
 * and resolve leaf aggregations. Missing names are collected across the
 * whole walk rather than thrown on immediately, so a caller sees every
 * unregistered reference in one error instead of just the first one a
 * query happens to touch.
 */
async function resolveCatalog(
  organizationId: string,
  projectId: string,
  names: readonly string[],
  precomputedActiveMetricDefsByName?: ReadonlyMap<string, MetricDefModel>,
): Promise<ResolvedCatalog> {
  const resolved = new Map<string, MetricDefModel>();
  const missing = new Set<string>();
  let frontier = [...new Set(names)];

  while (frontier.length > 0) {
    const fetched = precomputedActiveMetricDefsByName
      ? frontier.map((name) => ({ name, metricDef: precomputedActiveMetricDefsByName.get(name) ?? null }))
      : await Promise.all(
          frontier.map(async (name) => ({ name, metricDef: await getActiveMetricDefinition(organizationId, projectId, name) })),
        );

    const referencedNames = new Set<string>();
    for (const { name, metricDef } of fetched) {
      if (!metricDef) {
        missing.add(name);
        continue;
      }
      resolved.set(name, metricDef);
      if (metricDef.definition_kind === 'formula' && metricDef.formula) {
        collectIdentifiers(parseFormula(metricDef.formula)).forEach((referenceName) => referencedNames.add(referenceName));
      }
    }
    // Filtered only after the whole batch is merged into `resolved` — two
    // metrics fetched in the same round can reference each other (e.g. a
    // query requesting both a formula and the metric it references), and
    // filtering per-item mid-batch would re-queue an already-resolved name
    // for a redundant extra fetch next round.
    frontier = [...referencedNames].filter((name) => !resolved.has(name) && !missing.has(name));
  }

  if (missing.size > 0) {
    throw new MetricNotRegisteredError([...missing]);
  }

  const catalog: MetricCatalog = new Map([...resolved.entries()].map(([name, metricDef]) => [name, toCompilerDefinition(metricDef)]));
  const definitionRefs = Object.fromEntries([...resolved.entries()].map(([name, metricDef]) => [name, `metric:${name}@v${metricDef.version}`]));
  return { catalog, definitionRefs };
}

export interface CompileMetricQueryForProjectParams {
  organizationId: string;
  projectId: string;
  /** Compiled into the tenant predicate as `environment_id = @tenant_environment_id` when set — see `CompilerTenant.environmentId`'s own doc comment. Callers that resolve an environment (`queryMetrics`) always pass it; a direct caller that omits it compiles an env-unscoped query. */
  environmentId?: string;
  request: MetricQueryRequest;
  /**
   * Skips this call's own project existence/org-membership fetch when a
   * caller already has the project doc (mirrors `getProjectCostQuota`'s own
   * `precomputedProject` param — see its doc comment). Shape-checked against
   * `organizationId`/`projectId`, not re-fetched: a mismatched project still
   * throws {@link ProjectNotFoundError} rather than reading through.
   */
  precomputedProject?: ProjectModel;
  /**
   * Every currently-`active` metric definition in this project, keyed by
   * name. When supplied, `resolveCatalog` reads from this map instead of
   * issuing its own per-name (and, for a formula's transitive references,
   * per-round) Firestore fetch — see `queryBoardTile`'s own doc comment
   * (`board.service.ts`) for the board-tile N+1 this exists to close. A
   * caller must ensure the map reflects the project's current active-metric
   * state at the time it was built; this function never re-validates it.
   */
  precomputedActiveMetricDefsByName?: ReadonlyMap<string, MetricDefModel>;
}

export interface CompiledProjectMetricQuery extends CompiledMetricQuery {
  /** `metric:<name>@v<version>` for every metric (requested or transitively referenced by a formula) the compiled SQL depends on — the plan `12 §3` `definition_ref` shape, generalized to every dependency a multi-metric/formula query can have rather than just one. */
  definitionRefs: Record<string, string>;
  /** Every dependency of this compiled query whose table is a {@link KNOWN_UNBUILT_WAREHOUSE_TABLES} entry — empty for the overwhelmingly common case. Non-empty doesn't mean this compile *failed* (it didn't — `sql`/`params` above are still a fully valid compiled query); it's a signal for a caller about to actually execute the query (`queryMetrics`) that doing so is certain to fail against any real warehouse today, so it can fail fast with a clean `MetricTargetsUnbuiltWarehouseTableError` instead. */
  unbuiltWarehouseTables: UnbuiltWarehouseTableRef[];
}

/**
 * Resolves a project's registered metric definitions (KAN-40) from
 * Firestore and compiles a query request into BigQuery SQL (KAN-41). The
 * compiler itself (`@growthos/shared`) is pure and Firestore-free; this is
 * the thin integration point a future query API (KAN-42) or the AI
 * Analyst's `query_metric` tool would call.
 */
export async function compileMetricQueryForProject(params: CompileMetricQueryForProjectParams): Promise<CompiledProjectMetricQuery> {
  if (params.precomputedProject) {
    if (params.precomputedProject.organization_id !== params.organizationId || params.precomputedProject.id !== params.projectId) {
      throw new ProjectNotFoundError();
    }
  } else {
    await requireProjectInOrg(params.organizationId, params.projectId);
  }

  const { catalog, definitionRefs } = await resolveCatalog(
    params.organizationId,
    params.projectId,
    params.request.metrics,
    params.precomputedActiveMetricDefsByName,
  );
  const mappedCatalog = await mapCustomSchemaTables(params.organizationId, params.projectId, catalog);
  const unbuiltWarehouseTables = collectUnbuiltWarehouseTables(mappedCatalog);
  const compiled = compileMetricQuery(mappedCatalog, params.request, {
    organizationId: params.organizationId,
    projectId: params.projectId,
    ...(params.environmentId !== undefined ? { environmentId: params.environmentId } : {}),
  });

  return { ...compiled, definitionRefs, unbuiltWarehouseTables };
}

/**
 * Rewrites each aggregation's `table` to its mart-view name when it matches
 * one of the project's own ACTIVE measure/entity schemas (KAN-18
 * custom-schema marts — see `warehouse/schema-mart.ts` for the whole
 * design). Users register metrics against the plain schema name
 * (`ad_performance_daily`); the actual BigQuery relation is the
 * name-mangled per-project view. A table matching no registered schema
 * passes through untouched — dbt-built core tables (`fact_engagement_daily`
 * etc.) keep resolving by their own names.
 */
async function mapCustomSchemaTables(organizationId: string, projectId: string, catalog: MetricCatalog): Promise<MetricCatalog> {
  const needsLookup = [...catalog.values()].some((definition) => definition.aggregation !== undefined);
  if (!needsLookup) {
    return catalog;
  }
  const schemaDefs = await listSchemaDefinitionsForProject(organizationId, projectId);
  const martNameBySchemaName = new Map(
    schemaDefs
      .filter((def) => def.status === 'active' && (def.kind === 'measure' || def.kind === 'entity'))
      .map((def) => [def.name, martViewName(organizationId, projectId, def.name)] as const),
  );
  if (martNameBySchemaName.size === 0) {
    return catalog;
  }
  return new Map(
    [...catalog.entries()].map(([name, definition]) => {
      const mapped = definition.aggregation ? martNameBySchemaName.get(definition.aggregation.table) : undefined;
      if (!mapped || !definition.aggregation) {
        return [name, definition] as const;
      }
      return [name, { ...definition, aggregation: { ...definition.aggregation, table: mapped } }] as const;
    }),
  );
}
