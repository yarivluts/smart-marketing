import { defaultWarehouseQueryExecutor, type WarehouseQueryExecutor, type WarehouseRow } from '../warehouse/query-executor';
import { listActiveTrackingAlertsForProject } from './tracking-alert.service';
import { listRecentWinEventsForProject } from './win-rule.service';

/**
 * Read-only data adapters backing two of the MCP server's tools (KAN-75,
 * plan `12 §6.2`'s "funnels/cohorts" and "search_customers") that have no
 * existing service function to wrap directly, unlike `query_metric`/
 * `compare_periods`/`decompose` (all thin wrappers over the already-built
 * `queryMetrics`, KAN-42) or `list_metrics`/`describe_metric` (the already-
 * built metrics catalog). Both hand-write parameterized SQL against a dbt
 * core table (`entities`, KAN-37; `fact_cohort_retention`, KAN-62) and run it
 * through the same {@link WarehouseQueryExecutor} the compiler-produced SQL
 * in `metrics-query.service.ts` uses — `CompiledMetricQuery` is just
 * `{ sql, params }`, so this is legitimate reuse of that interface's own
 * contract, not a new escape hatch bypassing it. Like every other warehouse
 * read in this codebase today, both throw `WarehouseNotConfiguredError`
 * until KAN-18 provisions a real BigQuery project.
 *
 * `query_funnel` has no equivalent here: no fact table or query path for
 * step-conversion sequencing exists anywhere in this codebase yet (no
 * `fact_funnel_*` dbt model — only a client-side event-name-classification
 * heuristic, `funnel-suggestion/suggest.ts`, and an onboarding funnel-step
 * *confirmation* endpoint, neither of which computes a conversion query).
 * Building that is a materially separate change (a new dbt fact table plus
 * its own query shape) and is deliberately not attempted here — see
 * PROGRESS.md.
 */

export class InvalidMcpToolRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidMcpToolRequestError';
  }
}

function clampLimit(requested: number | undefined, fallback: number, max: number): number {
  const value = Math.trunc(requested ?? fallback);
  return Math.min(Math.max(value, 1), max);
}

/** BigQuery's JSON columns come back over the client library as a JSON-encoded string, not a parsed object — the same shape this adapter's hand-written SQL selects `properties` as. Falls back to the raw string if it somehow isn't valid JSON (never actually opaque data loss: the caller still gets *something* usable) rather than throwing on a row that otherwise matched the search. */
function parseJsonColumn(raw: string | number | null): unknown {
  if (typeof raw !== 'string') {
    return raw;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export interface SearchProjectCustomersParams {
  organizationId: string;
  projectId: string;
  /** Matched, case-sensitively, as a substring against the entity id and its raw JSON properties — a real warehouse's `LIKE` is case-insensitive per column collation in BigQuery's default; this adapter makes no promises either way beyond "substring match". */
  query: string;
  /** Restricts to one registered entity schema (e.g. `customer`) — omit to search across every entity kind landed for the project. */
  schemaName?: string;
  limit?: number;
  /** Defaults to {@link defaultWarehouseQueryExecutor} — overridable so tests can inject a fake executor without a real warehouse, the same convention `queryMetrics` establishes. */
  executor?: WarehouseQueryExecutor;
}

export interface CustomerSearchResult {
  entityId: string;
  schemaName: string;
  properties: unknown;
  lastSeenAt: string;
}

const DEFAULT_CUSTOMER_SEARCH_LIMIT = 20;
const MAX_CUSTOMER_SEARCH_LIMIT = 100;

function rowToCustomerResult(row: WarehouseRow): CustomerSearchResult {
  return {
    entityId: String(row.entity_id ?? ''),
    schemaName: String(row.schema_name ?? ''),
    properties: parseJsonColumn(row.properties),
    lastSeenAt: String(row.last_seen_at ?? ''),
  };
}

/** `search_customers` (plan `12 §6.2`, Customer 360): substring search over the `entities` core dbt table's latest-snapshot rows. Not environment-scoped, matching `queryMetrics`'s own convention of folding every environment into one project-level query. */
export async function searchProjectCustomers(params: SearchProjectCustomersParams): Promise<CustomerSearchResult[]> {
  const trimmedQuery = params.query.trim();
  if (trimmedQuery.length === 0) {
    throw new InvalidMcpToolRequestError('query must not be empty.');
  }
  const limit = clampLimit(params.limit, DEFAULT_CUSTOMER_SEARCH_LIMIT, MAX_CUSTOMER_SEARCH_LIMIT);
  const executor = params.executor ?? defaultWarehouseQueryExecutor;

  const filters = ['organization_id = @organizationId', 'project_id = @projectId', '(entity_id LIKE @likeQuery OR CAST(properties AS STRING) LIKE @likeQuery)'];
  const queryParams: Record<string, string> = {
    organizationId: params.organizationId,
    projectId: params.projectId,
    likeQuery: `%${trimmedQuery}%`,
  };
  if (params.schemaName) {
    filters.push('schema_name = @schemaName');
    queryParams.schemaName = params.schemaName;
  }

  const sql = `SELECT entity_id, schema_name, properties, last_seen_at FROM entities WHERE ${filters.join(' AND ')} ORDER BY last_seen_at DESC LIMIT ${limit}`;
  const rows = await executor.execute({ sql, params: queryParams });
  return rows.map(rowToCustomerResult);
}

export interface QueryProjectCohortRetentionParams {
  organizationId: string;
  projectId: string;
  /** Restricts to one cohort's rows (`YYYY-MM-01`, matching `fact_cohort_retention.cohort_month`'s own `date_trunc('month', ...)` grain) — omit to return every cohort's rows, newest cohort first. */
  cohortMonth?: string;
  limit?: number;
  executor?: WarehouseQueryExecutor;
}

export interface CohortRetentionRow {
  cohortMonth: string;
  periodNumber: number;
  cohortSize: number;
  retainedCount: number;
  retentionRate: number;
}

const DEFAULT_COHORT_ROW_LIMIT = 120;
const MAX_COHORT_ROW_LIMIT = 1000;

function rowToCohortRetentionRow(row: WarehouseRow): CohortRetentionRow {
  return {
    cohortMonth: String(row.cohort_month ?? ''),
    periodNumber: Number(row.period_number ?? 0),
    cohortSize: Number(row.cohort_size ?? 0),
    retainedCount: Number(row.retained_count ?? 0),
    retentionRate: Number(row.retention_rate ?? 0),
  };
}

/** The `query_cohort` half of plan `12 §6.2`'s "funnels/cohorts" tool: the `cohort_month x period_number` retention matrix `fact_cohort_retention` (KAN-62) already computes. See this module's own doc comment for why `query_funnel` is not built. */
export async function queryProjectCohortRetention(params: QueryProjectCohortRetentionParams): Promise<CohortRetentionRow[]> {
  const limit = clampLimit(params.limit, DEFAULT_COHORT_ROW_LIMIT, MAX_COHORT_ROW_LIMIT);
  const executor = params.executor ?? defaultWarehouseQueryExecutor;

  const filters = ['organization_id = @organizationId', 'project_id = @projectId'];
  const queryParams: Record<string, string> = {
    organizationId: params.organizationId,
    projectId: params.projectId,
  };
  if (params.cohortMonth) {
    filters.push('cohort_month = @cohortMonth');
    queryParams.cohortMonth = params.cohortMonth;
  }

  const sql = `SELECT cohort_month, period_number, cohort_size, retained_count, retention_rate FROM fact_cohort_retention WHERE ${filters.join(' AND ')} ORDER BY cohort_month DESC, period_number ASC LIMIT ${limit}`;
  const rows = await executor.execute({ sql, params: queryParams });
  return rows.map(rowToCohortRetentionRow);
}

export type ProjectInsightKind = 'tracking_alert' | 'win_event';
export type ProjectInsightSeverity = 'info' | 'warning';

export interface ProjectInsight {
  kind: ProjectInsightKind;
  id: string;
  title: string;
  detail: string;
  occurredAt: string;
  severity: ProjectInsightSeverity;
}

export interface ListProjectInsightsParams {
  organizationId: string;
  projectId: string;
  limit?: number;
}

const DEFAULT_INSIGHTS_LIMIT = 20;
const MAX_INSIGHTS_LIMIT = 100;

/**
 * `list_insights` (plan `12 §6.2`): fans out to the two per-project "here is
 * something noteworthy" feeds that already exist — active tracking-broke
 * episodes (KAN-36) and fired win-rule events (KAN-65/66) — and merges them
 * newest-first. Both sources are Firestore-backed, not warehouse-backed, so
 * (unlike every other tool in this file/module) this one actually returns
 * real data in every environment today, with no KAN-18 dependency.
 */
export async function listProjectInsights(params: ListProjectInsightsParams): Promise<ProjectInsight[]> {
  const limit = clampLimit(params.limit, DEFAULT_INSIGHTS_LIMIT, MAX_INSIGHTS_LIMIT);

  const [alerts, wins] = await Promise.all([
    listActiveTrackingAlertsForProject(params.organizationId, params.projectId),
    listRecentWinEventsForProject(params.organizationId, params.projectId, limit),
  ]);

  const alertInsights: ProjectInsight[] = alerts.map((alert) => ({
    kind: 'tracking_alert',
    id: alert.id,
    title: `Tracking may be broken: "${alert.schema_name}" has gone silent`,
    detail: `No new "${alert.schema_name}" records landed since ${alert.last_seen_at}.`,
    occurredAt: alert.detected_at,
    severity: 'warning',
  }));

  const winInsights: ProjectInsight[] = wins.map((win) => ({
    kind: 'win_event',
    id: win.id,
    title: `Win: ${win.win_rule_name}`,
    detail: `A "${win.schema_name}" record matched the "${win.win_rule_name}" win rule.`,
    occurredAt: win.occurred_at,
    severity: 'info',
  }));

  return [...alertInsights, ...winInsights]
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, limit);
}
