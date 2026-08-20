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
async function resolveCatalog(organizationId: string, projectId: string, names: readonly string[]): Promise<ResolvedCatalog> {
  const resolved = new Map<string, MetricDefModel>();
  const missing = new Set<string>();
  let frontier = [...new Set(names)];

  while (frontier.length > 0) {
    const fetched = await Promise.all(
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
}

export interface CompiledProjectMetricQuery extends CompiledMetricQuery {
  /** `metric:<name>@v<version>` for every metric (requested or transitively referenced by a formula) the compiled SQL depends on — the plan `12 §3` `definition_ref` shape, generalized to every dependency a multi-metric/formula query can have rather than just one. */
  definitionRefs: Record<string, string>;
}

/**
 * Resolves a project's registered metric definitions (KAN-40) from
 * Firestore and compiles a query request into BigQuery SQL (KAN-41). The
 * compiler itself (`@growthos/shared`) is pure and Firestore-free; this is
 * the thin integration point a future query API (KAN-42) or the AI
 * Analyst's `query_metric` tool would call.
 */
export async function compileMetricQueryForProject(params: CompileMetricQueryForProjectParams): Promise<CompiledProjectMetricQuery> {
  await requireProjectInOrg(params.organizationId, params.projectId);

  const { catalog, definitionRefs } = await resolveCatalog(params.organizationId, params.projectId, params.request.metrics);
  const mappedCatalog = await mapCustomSchemaTables(params.organizationId, params.projectId, catalog);
  const compiled = compileMetricQuery(mappedCatalog, params.request, {
    organizationId: params.organizationId,
    projectId: params.projectId,
    ...(params.environmentId !== undefined ? { environmentId: params.environmentId } : {}),
  });

  return { ...compiled, definitionRefs };
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
