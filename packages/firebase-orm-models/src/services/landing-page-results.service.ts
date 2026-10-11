import { conversionRate, type AdStudioResultsRow, type CompiledMetricQuery } from '@growthos/shared';
import { defaultWarehouseQueryExecutor, WarehouseNotConfiguredError, WarehouseQueryFailedError, type WarehouseQueryExecutor, type WarehouseRow } from '../warehouse/query-executor';
import { ProjectQueryQuotaExceededError, runQuotaGatedWarehouseQuery } from './cost-guardrail.service';

/** How many landing pages and campaigns a result carries - the busiest ones; the totals always cover everything. */
export const LANDING_PAGE_RESULTS_TOP_ROWS = 15;

export interface GetLandingPageResultsParams {
  organizationId: string;
  projectId: string;
  environmentId: string;
  /** First day of the window, YYYY-MM-DD (UTC), inclusive. */
  since: string;
  executor?: WarehouseQueryExecutor;
}

export interface LandingPageResults {
  totals: Omit<AdStudioResultsRow, 'key'>;
  landingPages: AdStudioResultsRow[];
  campaigns: AdStudioResultsRow[];
}

export type LandingPageResultsOutcome =
  | ({ status: 'ok' } & LandingPageResults)
  | { status: 'not_configured' }
  | { status: 'quota_exceeded'; message: string }
  | { status: 'error'; message: string };

/**
 * Visitors and conversions from `fact_landing_page_performance` since a day, in one statement of
 * three parts: the exact totals, the busiest landing pages and the busiest campaigns (each part
 * summed over every day and channel, then capped). Visitors are the fact table's daily distinct
 * landings summed over the window, conversions its last-touch conversions (see the dbt model's
 * doc comment); the rate is computed from those two sums, never averaged from daily rates.
 */
export function buildLandingPageResultsQuery(params: Omit<GetLandingPageResultsParams, 'executor'>): CompiledMetricQuery {
  const scope = 'organization_id = @organizationId AND project_id = @projectId AND environment_id = @environmentId AND activity_date >= CAST(@since AS DATE)';
  const part = (dimension: string, column: string | null) =>
    [
      `SELECT '${dimension}' AS dimension, ${column ?? "''"} AS dimension_value, SUM(visitors) AS visitors, SUM(conversions) AS conversions`,
      'FROM fact_landing_page_performance',
      `WHERE ${scope}`,
      ...(column ? [`GROUP BY ${column}`, `ORDER BY SUM(visitors) DESC, SUM(conversions) DESC, ${column}`, `LIMIT ${LANDING_PAGE_RESULTS_TOP_ROWS}`] : []),
    ].join('\n');
  const sql = [`(${part('total', null)})`, 'UNION ALL', `(${part('landing_page', 'landing_page')})`, 'UNION ALL', `(${part('campaign', 'campaign_id')})`].join('\n');
  return {
    sql,
    params: { organizationId: params.organizationId, projectId: params.projectId, environmentId: params.environmentId, since: params.since },
  };
}

function toRow(row: WarehouseRow): AdStudioResultsRow {
  const visitors = Number(row.visitors ?? 0);
  const conversions = Number(row.conversions ?? 0);
  return { key: String(row.dimension_value ?? ''), visitors, conversions, conversionRate: conversionRate(visitors, conversions) };
}

function byVolume(a: AdStudioResultsRow, b: AdStudioResultsRow): number {
  return b.visitors - a.visitors || b.conversions - a.conversions || a.key.localeCompare(b.key);
}

export function shapeLandingPageResults(rows: readonly WarehouseRow[]): LandingPageResults {
  const total = toRow(rows.find((row) => row.dimension === 'total') ?? {});
  return {
    totals: { visitors: total.visitors, conversions: total.conversions, conversionRate: total.conversionRate },
    landingPages: rows.filter((row) => row.dimension === 'landing_page').map(toRow).sort(byVolume),
    campaigns: rows.filter((row) => row.dimension === 'campaign').map(toRow).sort(byVolume),
  };
}

/**
 * The measured results the Ad Studio's planning stage (KAN-230) builds on, behind the same cost
 * guardrail as every other hand-written warehouse read. An unconfigured warehouse, an exhausted
 * query quota and a failed query each come back as a state rather than a throw, so the plan can
 * say which one it was instead of showing zeros.
 */
export async function getLandingPageResults(params: GetLandingPageResultsParams): Promise<LandingPageResultsOutcome> {
  const executor = params.executor ?? defaultWarehouseQueryExecutor;
  const query = buildLandingPageResultsQuery(params);
  try {
    const rows = await runQuotaGatedWarehouseQuery(params.organizationId, params.projectId, { tool: 'ad_studio_landing_page_results' }, () => executor.execute(query));
    return { status: 'ok', ...shapeLandingPageResults(rows) };
  } catch (error) {
    if (error instanceof WarehouseNotConfiguredError) return { status: 'not_configured' };
    if (error instanceof ProjectQueryQuotaExceededError) return { status: 'quota_exceeded', message: error.message };
    if (error instanceof WarehouseQueryFailedError) return { status: 'error', message: error.message };
    throw error;
  }
}
