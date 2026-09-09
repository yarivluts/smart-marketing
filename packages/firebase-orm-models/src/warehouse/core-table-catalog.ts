/**
 * The column catalog of every dbt-built core table (`packages/dbt-transform/
 * dbt/models/core`) as it actually exists in the warehouse — the missing
 * half of metric-registration validation. `metric-registry.service.ts`'s
 * `validateAggregationAgainstRegisteredSchema` has always been able to check
 * an aggregation against a project's own registered measure/entity schema
 * (whose mart view's columns are derivable from the schema itself), but a
 * metric targeting a core table was "left entirely alone", so a typo'd
 * column or a table dbt never builds registered fine and only failed at
 * query time with a raw warehouse error (the EasySign audit's P-05: three
 * metrics with `timeColumn: "date"` on a table that only has `landed_at`,
 * and one pointing at a table that does not exist).
 *
 * This is a static snapshot, not a live introspection: nothing in this
 * codebase inspects the warehouse's schema at request time (KAN-18's own
 * buildable-today posture, same reasoning `KNOWN_UNBUILT_WAREHOUSE_TABLES`
 * documents), so registration validation stays a pure Firestore + CPU
 * operation. Regenerate after any dbt core-model change with:
 *
 *   bq query --use_legacy_sql=false --format=json \
 *     "SELECT c.table_name, c.column_name, c.data_type
 *        FROM growthos_core.INFORMATION_SCHEMA.COLUMNS c
 *        JOIN growthos_core.INFORMATION_SCHEMA.TABLES t USING (table_name)
 *       WHERE t.table_type = 'BASE TABLE' ORDER BY 1, c.ordinal_position"
 *
 * `core-table-catalog.test.ts` guards drift in the other direction: every
 * model declared in `_core.yml` must have an entry here (or be listed in
 * `BIGQUERY_DISABLED_CORE_TABLES`), so a new dbt model can't ship without
 * teaching the registry its columns.
 */

/** BigQuery's own data-type vocabulary, collapsed to what registration validation needs to decide (numeric-or-not for `sum`/`avg`). */
export type CoreColumnType = 'STRING' | 'INT64' | 'FLOAT64' | 'BOOL' | 'TIMESTAMP' | 'DATE' | 'JSON';

export type CoreTableColumns = Readonly<Record<string, CoreColumnType>>;

const TENANT_COLUMNS: CoreTableColumns = { organization_id: 'STRING', project_id: 'STRING', environment_id: 'STRING' };

function table(columns: CoreTableColumns): CoreTableColumns {
  return Object.freeze({ ...TENANT_COLUMNS, ...columns });
}

/**
 * dbt core models declared in `_core.yml` but deliberately NOT built on
 * BigQuery (`{{ config(enabled=(target.type == 'duckdb')) }}`) because they
 * depend on a DuckDB-only seed whose real warehouse export doesn't exist
 * yet. A metric targeting one of these is rejected at registration with the
 * honest reason, and `KNOWN_UNBUILT_WAREHOUSE_TABLES` fails an already
 * registered one fast at query time — see `metrics-compiler.service.ts`.
 */
export const BIGQUERY_DISABLED_CORE_TABLES: ReadonlySet<string> = new Set(['fact_funnel_step']);

/** Snapshot taken 2026-09-09 from `growthos-g2w84.growthos_core` (see this module's own doc comment for the regeneration query). */
export const CORE_TABLE_CATALOG: Readonly<Record<string, CoreTableColumns>> = Object.freeze({
  bridge_identity: table({
    bridge_identity_key: 'STRING',
    anon_id: 'STRING',
    customer_id: 'STRING',
    method: 'STRING',
    confidence: 'FLOAT64',
    is_conflicted: 'BOOL',
    resolved_at: 'TIMESTAMP',
  }),
  dim_subscription: table({
    subscription_key: 'STRING',
    subscription_id: 'STRING',
    customer_id: 'STRING',
    status: 'STRING',
    currency: 'STRING',
    mrr: 'FLOAT64',
    plan_interval: 'STRING',
    current_period_end: 'TIMESTAMP',
    cancel_at_period_end: 'BOOL',
    canceled_at: 'TIMESTAMP',
    started_at: 'TIMESTAMP',
  }),
  entities: table({
    schema_name: 'STRING',
    entity_id: 'STRING',
    entity_key: 'STRING',
    properties: 'JSON',
    last_seen_at: 'TIMESTAMP',
  }),
  events: table({
    event_id: 'STRING',
    event_type: 'STRING',
    entity_id: 'STRING',
    properties: 'JSON',
    occurred_at: 'TIMESTAMP',
    landed_at: 'TIMESTAMP',
  }),
  fact_attribution: table({
    attribution_key: 'STRING',
    customer_id: 'STRING',
    conversion_event_id: 'STRING',
    conversion_event: 'STRING',
    occurred_at: 'TIMESTAMP',
    model: 'STRING',
    channel_id: 'STRING',
    campaign_id: 'STRING',
    landing_page: 'STRING',
    credit: 'FLOAT64',
  }),
  fact_cancellation_reason: table({
    cancellation_reason_key: 'STRING',
    customer_id: 'STRING',
    reason_code: 'STRING',
    comment: 'STRING',
    plan_interval: 'STRING',
    channel_id: 'STRING',
    cohort_month: 'TIMESTAMP',
    ts: 'TIMESTAMP',
  }),
  fact_cohort_retention: table({
    cohort_retention_key: 'STRING',
    cohort_month: 'TIMESTAMP',
    period_number: 'INT64',
    conversion_event: 'STRING',
    cohort_size: 'INT64',
    retained_count: 'INT64',
    retention_rate: 'FLOAT64',
  }),
  fact_company_firmographic: table({
    company_firmographic_key: 'STRING',
    customer_id: 'STRING',
    company_name: 'STRING',
    company_domain: 'STRING',
    employee_count_range: 'STRING',
    region: 'STRING',
    industry: 'STRING',
    mrr: 'FLOAT64',
    ts: 'TIMESTAMP',
  }),
  fact_customer_payback: table({
    customer_payback_key: 'STRING',
    customer_id: 'STRING',
    acquired_at: 'TIMESTAMP',
    channel_id: 'STRING',
    campaign_id: 'STRING',
    collected_revenue_7d: 'FLOAT64',
    collected_revenue_14d: 'FLOAT64',
    collected_revenue_30d: 'FLOAT64',
    collected_revenue_40d: 'FLOAT64',
  }),
  fact_demo_event: table({
    demo_event_key: 'STRING',
    demo_id: 'STRING',
    stage: 'STRING',
    rep_org_person_id: 'STRING',
    account_name: 'STRING',
    ts: 'TIMESTAMP',
  }),
  fact_engagement_daily: table({
    engagement_daily_key: 'STRING',
    activity_date: 'TIMESTAMP',
    dau: 'INT64',
    active_customers_l_n: 'INT64',
    dau_mau_ratio: 'FLOAT64',
  }),
  fact_engagement_depth_histogram: table({
    engagement_depth_histogram_key: 'STRING',
    as_of_date: 'TIMESTAMP',
    days_active_bucket: 'INT64',
    customer_count: 'INT64',
  }),
  fact_experiment_event: table({
    experiment_event_key: 'STRING',
    customer_id: 'STRING',
    event_type: 'STRING',
    experiment_key: 'STRING',
    variant_key: 'STRING',
    ts: 'TIMESTAMP',
  }),
  fact_funnel_event: table({
    funnel_event_key: 'STRING',
    customer_id: 'STRING',
    step: 'STRING',
    ts: 'TIMESTAMP',
  }),
  fact_landing_page_performance: table({
    landing_page_performance_key: 'STRING',
    activity_date: 'DATE',
    landing_page: 'STRING',
    campaign_id: 'STRING',
    channel_id: 'STRING',
    visitors: 'INT64',
    conversions: 'INT64',
  }),
  fact_quality_calibration: table({
    quality_calibration_key: 'STRING',
    customer_id: 'STRING',
    channel_id: 'STRING',
    cohort_month: 'TIMESTAMP',
    quality_score: 'FLOAT64',
    quality_tier: 'STRING',
    is_paying_customer: 'STRING',
    collected_revenue_7d: 'FLOAT64',
    collected_revenue_40d: 'FLOAT64',
    ts: 'TIMESTAMP',
  }),
  fact_revenue_event: table({
    revenue_event_key: 'STRING',
    customer_id: 'STRING',
    type: 'STRING',
    status: 'STRING',
    amount: 'FLOAT64',
    plan: 'STRING',
    mrr_delta: 'FLOAT64',
    ts: 'TIMESTAMP',
  }),
  fact_signup_quality_score: table({
    signup_quality_score_key: 'STRING',
    customer_id: 'STRING',
    company_size: 'STRING',
    budget_range: 'STRING',
    urgency: 'STRING',
    use_case: 'STRING',
    quality_score: 'FLOAT64',
    channel_id: 'STRING',
    cohort_month: 'TIMESTAMP',
    is_paying_customer: 'STRING',
    ts: 'TIMESTAMP',
  }),
  fact_subscription_event: table({
    subscription_event_key: 'STRING',
    subscription_id: 'STRING',
    customer_id: 'STRING',
    type: 'STRING',
    ts: 'TIMESTAMP',
  }),
  fact_support_ticket_event: table({
    support_ticket_event_key: 'STRING',
    ticket_id: 'STRING',
    stage: 'STRING',
    agent_org_person_id: 'STRING',
    first_response_seconds: 'FLOAT64',
    resolution_seconds: 'FLOAT64',
    csat_score: 'FLOAT64',
    ts: 'TIMESTAMP',
  }),
  fact_survey_response: table({
    survey_response_key: 'STRING',
    customer_id: 'STRING',
    survey_type: 'STRING',
    score: 'FLOAT64',
    plan_interval: 'STRING',
    channel_id: 'STRING',
    cohort_month: 'TIMESTAMP',
    ts: 'TIMESTAMP',
  }),
  measures: table({
    measure_id: 'STRING',
    measure_type: 'STRING',
    client_id: 'STRING',
    properties: 'JSON',
    measure_value: 'FLOAT64',
    measure_date: 'DATE',
    landed_at: 'TIMESTAMP',
  }),
});

const NUMERIC_CORE_COLUMN_TYPES: ReadonlySet<CoreColumnType> = new Set(['INT64', 'FLOAT64']);

export function isNumericCoreColumnType(type: CoreColumnType): boolean {
  return NUMERIC_CORE_COLUMN_TYPES.has(type);
}

/** The core table's columns, or `undefined` when `table` is not a dbt core table at all (a registered mart schema, or a typo). */
export function getCoreTableColumns(tableName: string): CoreTableColumns | undefined {
  return CORE_TABLE_CATALOG[tableName];
}
