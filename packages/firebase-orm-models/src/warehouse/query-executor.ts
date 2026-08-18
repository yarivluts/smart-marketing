import type { CompiledMetricQuery } from '@growthos/shared';
import { BigQuerySdkQueryClient, BigQueryWarehouseQueryExecutor } from './bigquery-query-executor';

/** One result row from a compiled metric query — column names are whatever the compiled SQL's own `SELECT` aliases (`bucket_date`, requested dimensions, `period` when comparing, and one column per requested metric name). */
export type WarehouseRow = Record<string, string | number | null>;

/**
 * Runs already-compiled BigQuery SQL (KAN-41) against the real warehouse and
 * returns its rows. Provider-agnostic so a real `@google-cloud/bigquery`-backed
 * implementation ({@link BigQueryWarehouseQueryExecutor}) can slot in without
 * callers changing — see {@link NotConfiguredWarehouseQueryExecutor}'s doc
 * comment for why `defaultWarehouseQueryExecutor` still falls back to it in
 * every environment without a real warehouse configured.
 */
export interface WarehouseQueryExecutor {
  execute(query: CompiledMetricQuery): Promise<WarehouseRow[]>;
}

export class WarehouseNotConfiguredError extends Error {
  constructor() {
    super('Warehouse query execution is not configured yet — no BigQuery project exists until KAN-18 provisions one.');
    this.name = 'WarehouseNotConfiguredError';
  }
}

/**
 * The fallback {@link WarehouseQueryExecutor}: unlike the pipeline's
 * raw-record Firestore stand-in (KAN-33), there is no meaningful Firestore
 * stand-in to execute a compiled query against either, since a metric's
 * `aggregation` declares a warehouse table/column (e.g.
 * `fact_ad_spend.reporting_spend`) that has no corresponding Firestore
 * collection; the actual landed data lives in `RawRecordModel` as opaque
 * per-record JSON payloads, not in the typed fact tables the compiler
 * assumes. Real execution needs both a provisioned BigQuery project (KAN-18
 * phase 1's `infra/terraform/bigquery.tf`, `terraform apply`d) and KAN-37's
 * dbt build having populated its fact tables before it's meaningful — see
 * `resolveDefaultWarehouseQueryExecutor`'s doc comment for exactly what
 * flips `defaultWarehouseQueryExecutor` over to
 * {@link BigQueryWarehouseQueryExecutor}. Throws a typed, catchable error
 * rather than returning an empty result set, so a caller can tell "not
 * configured yet" apart from "the query legitimately matched nothing".
 */
export class NotConfiguredWarehouseQueryExecutor implements WarehouseQueryExecutor {
  execute(): Promise<WarehouseRow[]> {
    return Promise.reject(new WarehouseNotConfiguredError());
  }
}

/** `infra/terraform/bigquery.tf`'s own defaults — the region its `google_bigquery_dataset` resources are provisioned in, and the dataset holding the dbt-built (KAN-37) fact/entity tables the compiler's SQL assumes (as opposed to `growthos_raw`, KAN-33's raw-landing-zone mirror). */
const DEFAULT_BIGQUERY_LOCATION = 'me-west1';
const DEFAULT_BIGQUERY_DATASET = 'growthos_core';

/**
 * Builds the `WarehouseQueryExecutor` every environment gets by default,
 * from env vars alone — the "env-driven factory swap" KAN-18 phase 2 scoped:
 * once a human `terraform apply`s `infra/terraform/bigquery.tf` and sets
 * `GROWTHOS_BIGQUERY_PROJECT_ID` (e.g. `growthos-g2w84`) on the Cloud Run
 * service, this switches to a real {@link BigQueryWarehouseQueryExecutor}
 * with no code change and no caller (`queryMetrics` et al.) needing to pass
 * an explicit `executor` override. `GROWTHOS_BIGQUERY_LOCATION`/
 * `GROWTHOS_BIGQUERY_DATASET` default to `infra/terraform/bigquery.tf`'s own
 * `var.region`/`growthos_core` and only need overriding if that file's
 * defaults are ever changed. Authentication is Application Default
 * Credentials (the Cloud Run service identity in production), same as
 * `connectFirestoreOrmAdmin` — no credential env var to set here.
 *
 * `env` is injectable (defaults to `process.env`) so tests can exercise both
 * branches deterministically, the same pattern
 * `loadLocalKmsKeyRingFromEnv` uses for its own env-driven config.
 */
export function resolveDefaultWarehouseQueryExecutor(env: NodeJS.ProcessEnv = process.env): WarehouseQueryExecutor {
  const projectId = env.GROWTHOS_BIGQUERY_PROJECT_ID;
  if (!projectId) {
    return new NotConfiguredWarehouseQueryExecutor();
  }
  const location = env.GROWTHOS_BIGQUERY_LOCATION ?? DEFAULT_BIGQUERY_LOCATION;
  const datasetId = env.GROWTHOS_BIGQUERY_DATASET ?? DEFAULT_BIGQUERY_DATASET;
  return new BigQueryWarehouseQueryExecutor(new BigQuerySdkQueryClient({ projectId, location, datasetId }));
}

export const defaultWarehouseQueryExecutor: WarehouseQueryExecutor = resolveDefaultWarehouseQueryExecutor();
