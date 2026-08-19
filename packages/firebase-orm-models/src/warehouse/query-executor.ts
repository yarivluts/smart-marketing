import type { CompiledMetricQuery } from '@growthos/shared';
import { BigQueryWarehouseQueryExecutor, createRealBigQueryClient } from './bigquery-query-executor';

/** One result row from a compiled metric query — column names are whatever the compiled SQL's own `SELECT` aliases (`bucket_date`, requested dimensions, `period` when comparing, and one column per requested metric name). */
export type WarehouseRow = Record<string, string | number | null>;

/**
 * Runs already-compiled BigQuery SQL (KAN-41) against the real warehouse and
 * returns its rows. Provider-agnostic so a real `@google-cloud/bigquery`-backed
 * implementation can slot in later without callers changing — see
 * {@link NotConfiguredWarehouseQueryExecutor}'s doc comment for why today's
 * default throws instead.
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
 * A configured warehouse REJECTED a query — table not found (a metric
 * registered against a mart table dbt hasn't built), unknown column, a SQL
 * error, quota/permission trouble on the BigQuery side, etc. Distinct from
 * {@link WarehouseNotConfiguredError} ("no warehouse at all"), and typed so
 * board tiles/goal thermometers can degrade per-tile the same way they
 * already do for a not-configured warehouse, instead of rethrowing a
 * generic Error that crashes the whole page. These failures depend on
 * user-registered metric config (any project member can register a metric
 * naming a table that doesn't exist), so they are an *expected* runtime
 * outcome, not a code bug — the deliberate non-blanket-catch posture in
 * `queryBoardTile` stays intact for everything else.
 */
export class WarehouseQueryFailedError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'WarehouseQueryFailedError';
  }
}

/**
 * The default {@link WarehouseQueryExecutor} in every environment today: this
 * repo has no real BigQuery project, and — unlike the pipeline's raw-record
 * Firestore stand-in (KAN-33) — there is no meaningful Firestore stand-in to
 * execute a compiled query against either, since a metric's `aggregation`
 * declares a warehouse table/column (e.g. `fact_ad_spend.reporting_spend`)
 * that has no corresponding Firestore collection; the actual landed data
 * lives in `RawRecordModel` as opaque per-record JSON payloads, not in the
 * typed fact tables the compiler assumes. Real execution needs both KAN-18
 * (a BigQuery project) and KAN-37 (dbt building those fact tables from raw
 * records) before it's buildable. Throws a typed, catchable error rather than
 * returning an empty result set, so a caller can tell "not configured yet"
 * apart from "the query legitimately matched nothing".
 */
export class NotConfiguredWarehouseQueryExecutor implements WarehouseQueryExecutor {
  execute(): Promise<WarehouseRow[]> {
    return Promise.reject(new WarehouseNotConfiguredError());
  }
}

/** Which real BigQuery project/dataset/location to run compiled queries against — see {@link readWarehouseEnvConfig}. */
export interface WarehouseEnvConfig {
  projectId?: string;
  dataset?: string;
  location?: string;
}

/**
 * Reads the BigQuery project/dataset/location a real warehouse would run
 * against from the environment (Cloud Run env vars at deploy time, per
 * `infra/terraform/bigquery.tf`'s `growthos_core` dataset — KAN-18 phase 2).
 * `GOOGLE_CLOUD_PROJECT`/`GCLOUD_PROJECT` are the project id env vars the
 * `@google-cloud/bigquery` client itself already recognizes for
 * Application Default Credentials, reused here rather than inventing a
 * third project-id env var; `GROWTHOS_BIGQUERY_CORE_DATASET`/
 * `GROWTHOS_BIGQUERY_LOCATION` are new, GrowthOS-specific.
 */
export function readWarehouseEnvConfig(env: NodeJS.ProcessEnv = process.env): WarehouseEnvConfig {
  return {
    projectId: env.GOOGLE_CLOUD_PROJECT ?? env.GCLOUD_PROJECT ?? undefined,
    dataset: env.GROWTHOS_BIGQUERY_CORE_DATASET ?? undefined,
    location: env.GROWTHOS_BIGQUERY_LOCATION ?? undefined,
  };
}

/**
 * The env-driven factory behind {@link defaultWarehouseQueryExecutor}:
 * returns a real {@link BigQueryWarehouseQueryExecutor} once a project id
 * *and* a dataset are both configured, otherwise the same
 * {@link NotConfiguredWarehouseQueryExecutor} every environment has used
 * until now. Exported separately (rather than only inlined into the
 * default) so a test can exercise the "configured" branch against a fake
 * env object without mutating real `process.env` or needing real GCP
 * credentials.
 */
export function resolveWarehouseQueryExecutorFromEnv(env: NodeJS.ProcessEnv = process.env): WarehouseQueryExecutor {
  const config = readWarehouseEnvConfig(env);
  if (!config.projectId || !config.dataset) {
    return new NotConfiguredWarehouseQueryExecutor();
  }
  return new BigQueryWarehouseQueryExecutor({
    client: createRealBigQueryClient(config.projectId),
    dataset: config.dataset,
    location: config.location,
  });
}

/**
 * Resolved once at module load from real `process.env` — every environment
 * today (including CI) has no `GROWTHOS_BIGQUERY_CORE_DATASET` set, so this
 * stays the inert {@link NotConfiguredWarehouseQueryExecutor} until KAN-18's
 * `infra/terraform/bigquery.tf` is applied and a deploy sets the three env
 * vars {@link readWarehouseEnvConfig} reads. Frozen at import time rather
 * than re-read per call, matching how Cloud Run env vars are only ever set
 * at deploy time, never mutated at runtime.
 */
export const defaultWarehouseQueryExecutor: WarehouseQueryExecutor = resolveWarehouseQueryExecutorFromEnv();
