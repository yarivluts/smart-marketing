import { defaultWarehouseQueryExecutor, readWarehouseEnvConfig, WarehouseNotConfiguredError, WarehouseQueryFailedError, type WarehouseQueryExecutor } from '../warehouse/query-executor';
import { buildMartViewSql, martViewName, MART_KINDS } from '../warehouse/schema-mart';
import type { SchemaDefModel } from '../models/schema-def.model';
import { listSchemaDefinitionsForProject } from './schema-registry.service';

export interface SyncSchemaMartViewParams {
  organizationId: string;
  projectId: string;
  schemaDef: Pick<SchemaDefModel, 'kind' | 'name' | 'field_defs'>;
  /** Defaults to {@link defaultWarehouseQueryExecutor} — overridable so tests can inject a fake executor. */
  executor?: WarehouseQueryExecutor;
  /** The dataset the view + its source live in — defaults to `GROWTHOS_BIGQUERY_CORE_DATASET` from the environment; overridable for tests. Unset (dev/CI) counts as "warehouse not configured". */
  dataset?: string;
}

export type SchemaMartSyncOutcome =
  | { status: 'synced'; viewName: string }
  | { status: 'skipped_kind' }
  | { status: 'skipped_not_configured' }
  | { status: 'error'; message: string };

/**
 * Creates/replaces the BigQuery mart view for one registered schema (see
 * `warehouse/schema-mart.ts` for the design). Non-throwing by design for
 * the two expected non-outcomes — an unconfigured warehouse (dev/CI/tests)
 * and a warehouse-side rejection — so the schema-registry write paths can
 * call it best-effort without a warehouse hiccup failing the registration
 * itself; anything unrecognized still throws (a coding bug should surface,
 * not degrade silently).
 */
export async function syncSchemaMartView(params: SyncSchemaMartViewParams): Promise<SchemaMartSyncOutcome> {
  if (!MART_KINDS.includes(params.schemaDef.kind)) {
    return { status: 'skipped_kind' };
  }
  const dataset = params.dataset ?? readWarehouseEnvConfig().dataset;
  if (!dataset) {
    return { status: 'skipped_not_configured' };
  }
  const executor = params.executor ?? defaultWarehouseQueryExecutor;
  const sql = buildMartViewSql({
    organizationId: params.organizationId,
    projectId: params.projectId,
    kind: params.schemaDef.kind,
    schemaName: params.schemaDef.name,
    fieldDefs: params.schemaDef.field_defs,
    dataset,
  });

  try {
    await executor.execute({ sql, params: {} });
    return { status: 'synced', viewName: martViewName(params.organizationId, params.projectId, params.schemaDef.name) };
  } catch (error) {
    if (error instanceof WarehouseNotConfiguredError) {
      return { status: 'skipped_not_configured' };
    }
    if (error instanceof WarehouseQueryFailedError) {
      return { status: 'error', message: error.message };
    }
    throw error;
  }
}

export interface SyncAllSchemaMartViewsResult {
  synced: string[];
  errors: { schemaName: string; message: string }[];
  warehouseConfigured: boolean;
}

/**
 * Backfill/repair sweep: (re)creates the mart view for every ACTIVE
 * measure/entity schema in the project — the admin "Sync warehouse views"
 * action, and the catch-up path for schemas registered before mart
 * generation existed (or whose view drifted for any reason). One view per
 * active schema family; historical versions don't get views.
 */
export async function syncAllSchemaMartViewsForProject(
  organizationId: string,
  projectId: string,
  executor?: WarehouseQueryExecutor,
): Promise<SyncAllSchemaMartViewsResult> {
  const defs = await listSchemaDefinitionsForProject(organizationId, projectId);
  const active = defs.filter((def) => def.status === 'active' && MART_KINDS.includes(def.kind));

  const result: SyncAllSchemaMartViewsResult = { synced: [], errors: [], warehouseConfigured: true };
  for (const def of active) {
    const outcome = await syncSchemaMartView({ organizationId, projectId, schemaDef: def, ...(executor ? { executor } : {}) });
    if (outcome.status === 'synced') {
      result.synced.push(outcome.viewName);
    } else if (outcome.status === 'error') {
      result.errors.push({ schemaName: def.name, message: outcome.message });
    } else if (outcome.status === 'skipped_not_configured') {
      result.warehouseConfigured = false;
      break;
    }
  }
  return result;
}
