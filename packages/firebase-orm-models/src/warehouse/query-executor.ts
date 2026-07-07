import type { CompiledMetricQuery } from '@growthos/shared';

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

export const defaultWarehouseQueryExecutor: WarehouseQueryExecutor = new NotConfiguredWarehouseQueryExecutor();
