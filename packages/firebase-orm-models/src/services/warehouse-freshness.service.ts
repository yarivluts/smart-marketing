import { defaultWarehouseQueryExecutor, WarehouseNotConfiguredError, WarehouseQueryFailedError, type WarehouseQueryExecutor } from '../warehouse/query-executor';
import { resolveDefaultQueryEnvironment } from './organization.service';

export interface GetWarehouseFreshnessParams {
  organizationId: string;
  projectId: string;
  /** Same semantics as `QueryMetricsParams.environmentId` — omitted resolves the project's `prod` default server-side. */
  environmentId?: string;
  /** Defaults to {@link defaultWarehouseQueryExecutor} — overridable so tests can inject a fake executor, the same convention every other warehouse read here uses. */
  executor?: WarehouseQueryExecutor;
}

/**
 * Discriminated so the panel can render each state distinctly: a project on
 * an environment with no warehouse configured is a different message from a
 * configured warehouse whose query failed, which is different again from
 * "configured, queried fine, zero rows landed yet".
 */
export type WarehouseFreshnessResult =
  | { status: 'not_configured' }
  | { status: 'error'; message: string }
  | { status: 'ok'; latestLandedAt: string | null; landedRecordCount: number };

/**
 * Live warehouse freshness for the ingest-health page's orchestration panel
 * (KAN-38 follow-up): the latest `landed_at` and total landed-record count
 * for this project+environment, read straight from the warehouse's
 * `stg_raw_records` view. Exists because the panel's run-history list only
 * ever shows `OrchestrationRunModel` records, which only the in-app
 * "Run now" button writes — the scheduled Cloud Run Job (`dbt-refresh`,
 * hourly, see `packages/dbt-transform/Dockerfile`) refreshes the warehouse
 * entirely outside that bookkeeping, so the natural "is my data
 * refreshing?" page looked permanently empty while the real refresh ran
 * like clockwork (session-B QA, 2026-08-20). Freshness read from the
 * warehouse itself answers the actual question regardless of WHICH
 * mechanism refreshed it.
 */
export async function getWarehouseFreshnessForProject(params: GetWarehouseFreshnessParams): Promise<WarehouseFreshnessResult> {
  const executor = params.executor ?? defaultWarehouseQueryExecutor;
  const environmentId = params.environmentId ?? (await resolveDefaultQueryEnvironment(params.organizationId, params.projectId))?.id;

  const filters = ['organization_id = @organizationId', 'project_id = @projectId'];
  const queryParams: Record<string, string> = { organizationId: params.organizationId, projectId: params.projectId };
  if (environmentId !== undefined) {
    filters.push('environment_id = @environmentId');
    queryParams.environmentId = environmentId;
  }

  const sql = `SELECT CAST(MAX(landed_at) AS STRING) AS latest_landed_at, COUNT(*) AS landed_record_count FROM stg_raw_records WHERE ${filters.join(' AND ')}`;

  try {
    const [row] = await executor.execute({ sql, params: queryParams });
    const latest = row?.latest_landed_at;
    return {
      status: 'ok',
      latestLandedAt: typeof latest === 'string' && latest.length > 0 ? latest : null,
      landedRecordCount: Number(row?.landed_record_count ?? 0),
    };
  } catch (error) {
    if (error instanceof WarehouseNotConfiguredError) {
      return { status: 'not_configured' };
    }
    if (error instanceof WarehouseQueryFailedError) {
      return { status: 'error', message: error.message };
    }
    throw error;
  }
}
