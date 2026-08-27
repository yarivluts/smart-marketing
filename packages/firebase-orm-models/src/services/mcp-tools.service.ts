import { defaultWarehouseQueryExecutor, WarehouseNotConfiguredError, WarehouseQueryFailedError, type WarehouseQueryExecutor, type WarehouseRow } from '../warehouse/query-executor';
import { listActiveTrackingAlertsForProject } from './tracking-alert.service';
import { resolveDefaultQueryEnvironment } from './organization.service';
import { listRecentWinEventsForProject } from './win-rule.service';
import { getOnboardingState } from './onboarding.service';
import { runQuotaGatedWarehouseQuery, ProjectQueryQuotaExceededError } from './cost-guardrail.service';

/**
 * Read-only data adapters backing three of the MCP server's tools (KAN-75,
 * plan `12 §6.2`'s "funnels/cohorts" and "search_customers") that have no
 * existing service function to wrap directly, unlike `query_metric`/
 * `compare_periods`/`decompose` (all thin wrappers over the already-built
 * `queryMetrics`, KAN-42) or `list_metrics`/`describe_metric` (the already-
 * built metrics catalog). All three hand-write parameterized SQL against a
 * dbt core table (`entities`, KAN-37; `fact_cohort_retention`, KAN-62;
 * `events`, KAN-37 — see `queryProjectFunnelSteps` for why the funnel reads
 * `events` directly rather than the `fact_funnel_step` model) and run it
 * through the same {@link WarehouseQueryExecutor} the compiler-produced SQL in
 * `metrics-query.service.ts` uses — `CompiledMetricQuery` is just
 * `{ sql, params }`, so this is legitimate reuse of that interface's own
 * contract, not a new escape hatch bypassing it. Each throws
 * `WarehouseNotConfiguredError` in an environment with no warehouse wired up
 * (the default until KAN-18 provisions a real BigQuery project), and — since
 * KAN-39 — `ProjectQueryQuotaExceededError` once the project has spent its
 * daily query quota (`runQuotaGatedWarehouseQuery`, same guardrail
 * `queryMetrics` enforces); both are already mapped to a caller-readable MCP
 * tool error by `apps/api`'s `describeMetricsError`.
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

/** BigQuery's JSON columns come back over the client library as a JSON-encoded string, not a parsed object — the same shape this adapter's hand-written SQL selects `properties` as. Falls back to the raw string if it somehow isn't valid JSON (never actually opaque data loss: the caller still gets *something* usable) rather than throwing on a row that otherwise matched the search. Exported for `segment.service.ts`'s `listSegmentMembers`, which selects the same `properties` column and needs the exact same JSON-string handling. */
export function parseJsonColumn(raw: string | number | null): unknown {
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
  /** The environment whose rows to search — same semantics as `QueryMetricsParams.environmentId`: an API-key caller passes its key's bound environment; omitted resolves the project's `prod` default server-side. */
  environmentId?: string;
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

/** Escapes `LIKE`'s own wildcard metacharacters (`%`/`_`, with `\` as BigQuery's implicit default escape character) so a caller searching for a literal `%`/`_` — a real character in an email, a discount code, anything — gets a literal substring match instead of the wildcard silently matching "any characters"/"any single character" there. Exported for `segment.service.ts`'s `countSegmentMembers`, which needs the exact same escaping for its own `contains` filter operator. */
export function escapeLikePattern(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function rowToCustomerResult(row: WarehouseRow): CustomerSearchResult {
  return {
    entityId: String(row.entity_id ?? ''),
    schemaName: String(row.schema_name ?? ''),
    properties: parseJsonColumn(row.properties),
    lastSeenAt: String(row.last_seen_at ?? ''),
  };
}

/** `search_customers` (plan `12 §6.2`, Customer 360): substring search over the `entities` core dbt table's latest-snapshot rows, environment-scoped like every other warehouse read since session-B's mixing catch (2026-08-19) — see `QueryMetricsParams.environmentId`. */
export async function searchProjectCustomers(params: SearchProjectCustomersParams): Promise<CustomerSearchResult[]> {
  const trimmedQuery = params.query.trim();
  if (trimmedQuery.length === 0) {
    throw new InvalidMcpToolRequestError('query must not be empty.');
  }
  const limit = clampLimit(params.limit, DEFAULT_CUSTOMER_SEARCH_LIMIT, MAX_CUSTOMER_SEARCH_LIMIT);
  const executor = params.executor ?? defaultWarehouseQueryExecutor;
  const environmentId = params.environmentId ?? (await resolveDefaultQueryEnvironment(params.organizationId, params.projectId))?.id;

  // TO_JSON_STRING, not CAST(... AS STRING): BigQuery rejects a direct
  // JSON→STRING cast outright ("Invalid cast from JSON to STRING") — found
  // live the first time this tool ran against the real warehouse
  // (session-B QA, 2026-08-20); the fake-executor tests can't catch dialect
  // validity, only query shape.
  const filters = ['organization_id = @organizationId', 'project_id = @projectId', '(entity_id LIKE @likeQuery OR TO_JSON_STRING(properties) LIKE @likeQuery)'];
  const queryParams: Record<string, string> = {
    organizationId: params.organizationId,
    projectId: params.projectId,
    likeQuery: `%${escapeLikePattern(trimmedQuery)}%`,
  };
  if (environmentId !== undefined) {
    filters.push('environment_id = @environmentId');
    queryParams.environmentId = environmentId;
  }
  if (params.schemaName) {
    filters.push('schema_name = @schemaName');
    queryParams.schemaName = params.schemaName;
  }

  const sql = `SELECT entity_id, schema_name, properties, last_seen_at FROM entities WHERE ${filters.join(' AND ')} ORDER BY last_seen_at DESC LIMIT ${limit}`;
  const rows = await runQuotaGatedWarehouseQuery(params.organizationId, params.projectId, { tool: 'search_customers' }, () =>
    executor.execute({ sql, params: queryParams }),
  );
  return rows.map(rowToCustomerResult);
}

/** Mirrors `SegmentMemberCountOutcome`/`SegmentMemberListOutcome`'s exact ok/degraded shape and reason vocabulary (`segment.service.ts`) — `searchProjectCustomersForAdmin` below backs a page's own search box, not an MCP tool call that can just error out, so the same three expected-not-buggy warehouse failure modes degrade instead of throwing. */
export type CustomerSearchOutcome =
  | { ok: true; results: CustomerSearchResult[] }
  | { ok: false; reason: 'warehouse_not_configured' | 'quota_exceeded' | 'query_error'; message: string };

/**
 * The admin-page counterpart of {@link searchProjectCustomers} (KAN-108) — same substring-search
 * semantics and validation (an empty/whitespace-only `query` still throws
 * `InvalidMcpToolRequestError`, a caller bug rather than an expected runtime failure a page should
 * degrade for), but wraps the warehouse call the way `countSegmentMembers`/`listSegmentMembers`
 * already do so a page rendering results can show a typed "why not" state instead of crashing. Closes
 * the "Customer 360" admin-surface gap this MCP tool never got a human-facing home for — see
 * `omnisearch/types.ts`'s "no first-class individual-customer index yet" doc comment, which this
 * finally addresses without needing a new index: the same `entities` table `search_customers` already
 * reads is now also browsable from the web app.
 */
export async function searchProjectCustomersForAdmin(params: SearchProjectCustomersParams): Promise<CustomerSearchOutcome> {
  try {
    const results = await searchProjectCustomers(params);
    return { ok: true, results };
  } catch (error) {
    if (error instanceof WarehouseNotConfiguredError) {
      return { ok: false, reason: 'warehouse_not_configured', message: error.message };
    }
    if (error instanceof ProjectQueryQuotaExceededError) {
      return { ok: false, reason: 'quota_exceeded', message: error.message };
    }
    if (error instanceof WarehouseQueryFailedError) {
      return { ok: false, reason: 'query_error', message: error.message };
    }
    throw error;
  }
}

export interface QueryProjectCohortRetentionParams {
  organizationId: string;
  projectId: string;
  /** Restricts to one cohort's rows (`YYYY-MM-01`, matching `fact_cohort_retention.cohort_month`'s own `date_trunc('month', ...)` grain) — omit to return every cohort's rows, newest cohort first. */
  cohortMonth?: string;
  limit?: number;
  /** Same semantics as `SearchProjectCustomersParams.environmentId`. */
  environmentId?: string;
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

/** The `query_cohort` half of plan `12 §6.2`'s "funnels/cohorts" tool: the `cohort_month x period_number` retention matrix `fact_cohort_retention` (KAN-62) already computes. Its `query_funnel` sibling is {@link queryProjectFunnelSteps}. */
export async function queryProjectCohortRetention(params: QueryProjectCohortRetentionParams): Promise<CohortRetentionRow[]> {
  const limit = clampLimit(params.limit, DEFAULT_COHORT_ROW_LIMIT, MAX_COHORT_ROW_LIMIT);
  const executor = params.executor ?? defaultWarehouseQueryExecutor;
  const environmentId = params.environmentId ?? (await resolveDefaultQueryEnvironment(params.organizationId, params.projectId))?.id;

  const filters = ['organization_id = @organizationId', 'project_id = @projectId'];
  const queryParams: Record<string, string> = {
    organizationId: params.organizationId,
    projectId: params.projectId,
  };
  if (environmentId !== undefined) {
    filters.push('environment_id = @environmentId');
    queryParams.environmentId = environmentId;
  }
  if (params.cohortMonth) {
    filters.push('cohort_month = @cohortMonth');
    queryParams.cohortMonth = params.cohortMonth;
  }

  const sql = `SELECT cohort_month, period_number, cohort_size, retained_count, retention_rate FROM fact_cohort_retention WHERE ${filters.join(' AND ')} ORDER BY cohort_month DESC, period_number ASC LIMIT ${limit}`;
  const rows = await runQuotaGatedWarehouseQuery(params.organizationId, params.projectId, { tool: 'query_cohort' }, () =>
    executor.execute({ sql, params: queryParams }),
  );
  return rows.map(rowToCohortRetentionRow);
}

/** Mirrors `CustomerSearchOutcome`'s exact ok/degraded shape and reason vocabulary — `queryProjectCohortRetentionForAdmin` below backs a page's own retention-matrix table, not an MCP tool call that can just error out, so the same three expected-not-buggy warehouse failure modes degrade instead of throwing. */
export type CohortRetentionOutcome =
  | { ok: true; rows: CohortRetentionRow[] }
  | { ok: false; reason: 'warehouse_not_configured' | 'quota_exceeded' | 'query_error'; message: string };

/**
 * The admin-page counterpart of {@link queryProjectCohortRetention} (KAN-113) — same
 * `cohort_month x period_number` retention-matrix semantics, but wraps the warehouse call the way
 * `searchProjectCustomersForAdmin` (KAN-108) already does so a page rendering the matrix can show a
 * typed "why not" state instead of crashing. Closes the same shape of gap KAN-108/KAN-111 already
 * closed for `search_customers`/`query_funnel`: `query_cohort` was only ever reachable through the MCP
 * server's own tool, with no route or page anywhere under `apps/web` ever calling it.
 */
export async function queryProjectCohortRetentionForAdmin(params: QueryProjectCohortRetentionParams): Promise<CohortRetentionOutcome> {
  try {
    const rows = await queryProjectCohortRetention(params);
    return { ok: true, rows };
  } catch (error) {
    if (error instanceof WarehouseNotConfiguredError) {
      return { ok: false, reason: 'warehouse_not_configured', message: error.message };
    }
    if (error instanceof ProjectQueryQuotaExceededError) {
      return { ok: false, reason: 'quota_exceeded', message: error.message };
    }
    if (error instanceof WarehouseQueryFailedError) {
      return { ok: false, reason: 'query_error', message: error.message };
    }
    throw error;
  }
}

export interface QueryProjectFunnelStepsParams {
  organizationId: string;
  projectId: string;
  /** Same semantics as `SearchProjectCustomersParams.environmentId`. */
  environmentId?: string;
  executor?: WarehouseQueryExecutor;
}

export interface FunnelStepResult {
  stageKey: string;
  stepOrder: number;
  /** Distinct customers who ever reached this stage (`fact_funnel_step`'s own "first reached" grain — a customer can't inflate this by re-firing the same step event). */
  customerCount: number;
  /** `customerCount` as a fraction of the funnel's first step's own `customerCount` (1.0 for the first step itself; 0 when the first step had nobody). Computed here, not in SQL — a single small division over an already-small result set. */
  conversionRateFromFirst: number;
}

/**
 * The `query_funnel` half of plan `12 §6.2`'s "funnels/cohorts" tool:
 * per-stage distinct-customer counts for the project's own human-confirmed
 * funnel, in the confirmed step order, each stage's count also expressed as a
 * conversion rate off the first step.
 *
 * The confirmed funnel lives in Firestore (`OnboardingStateModel.funnel_steps`,
 * KAN-68), NOT in the warehouse: the dbt `fact_funnel_step` model that would
 * otherwise hold it stays DuckDB-only because its `funnel_step_mappings` seed
 * has no real warehouse export yet (same posture #133 lifted for the identity
 * chain). So this reads the confirmed steps from Firestore and counts distinct
 * customers per step straight off the BigQuery-enabled `events` core table —
 * the same hand-written-SQL-over-`WarehouseQueryExecutor` pattern
 * `searchProjectCustomers`/`queryProjectCohortRetention` use. A step is keyed
 * by its `eventSchemaName` matched against `events.event_type` (the same
 * fixed-path narrowing #133 took for identity): the onboarding wizard proposes
 * funnel steps *from* event schemas, so this is the faithful key, and it keeps
 * every dynamic value a bound parameter rather than the DuckDB fixture model's
 * data-driven `coalesce(event_name, event_type)` label.
 *
 * `COUNT(DISTINCT entity_id)` is the distinct-customer count reaching each
 * step, so a customer re-firing the same step event can't inflate it — the
 * same "first reached" grain `fact_funnel_step` computes, without needing the
 * per-customer min-timestamp. One row per confirmed step (a step with no
 * events yet reports a real `0`, not a dropped row, so the funnel's drop-off
 * is visible end to end). A project whose funnel isn't confirmed yet (no
 * onboarding state, or an empty funnel) returns an empty list without touching
 * the warehouse.
 */
export async function queryProjectFunnelSteps(params: QueryProjectFunnelStepsParams): Promise<FunnelStepResult[]> {
  const state = await getOnboardingState(params.organizationId, params.projectId);
  const steps = [...(state?.funnel_steps ?? [])].sort((a, b) => a.order - b.order);
  if (steps.length === 0) {
    return [];
  }

  const executor = params.executor ?? defaultWarehouseQueryExecutor;
  const environmentId = params.environmentId ?? (await resolveDefaultQueryEnvironment(params.organizationId, params.projectId))?.id;

  const filters = ['organization_id = @organizationId', 'project_id = @projectId'];
  const queryParams: Record<string, string> = {
    organizationId: params.organizationId,
    projectId: params.projectId,
  };
  if (environmentId !== undefined) {
    filters.push('environment_id = @environmentId');
    queryParams.environmentId = environmentId;
  }

  // The distinct event schema names across the confirmed steps, bound as
  // parameters (never spliced into the SQL) — a funnel could in principle map
  // two stages to the same event schema, so dedupe for the `IN` list and fan
  // the count back out to every step below.
  const schemaNames = [...new Set(steps.map((step) => step.eventSchemaName))];
  const boundSchemaParams = schemaNames.map((name, index) => {
    const paramName = `funnelEvent${index}`;
    queryParams[paramName] = name;
    return `@${paramName}`;
  });
  filters.push(`event_type IN (${boundSchemaParams.join(', ')})`);

  const sql = `SELECT event_type, COUNT(DISTINCT entity_id) AS customer_count FROM events WHERE ${filters.join(' AND ')} GROUP BY event_type`;
  const rows = await runQuotaGatedWarehouseQuery(params.organizationId, params.projectId, { tool: 'query_funnel' }, () =>
    executor.execute({ sql, params: queryParams }),
  );

  const countByEventType = new Map<string, number>();
  for (const row of rows) {
    countByEventType.set(String(row.event_type ?? ''), Number(row.customer_count ?? 0));
  }

  const firstStepCount = countByEventType.get(steps[0].eventSchemaName) ?? 0;
  return steps.map((step) => {
    const customerCount = countByEventType.get(step.eventSchemaName) ?? 0;
    return {
      stageKey: step.stageKey,
      stepOrder: step.order,
      customerCount,
      conversionRateFromFirst: firstStepCount > 0 ? customerCount / firstStepCount : 0,
    };
  });
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
