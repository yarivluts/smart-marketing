import { BigQuery } from '@google-cloud/bigquery';
import type { CompiledMetricQuery, CompilerParamValue } from '@growthos/shared';
import { WarehouseQueryFailedError, type WarehouseQueryExecutorWithStats, type WarehouseQueryStats, type WarehouseRow } from './query-executor';

/**
 * BigQuery's public on-demand analysis price as of this writing — $6.25 per
 * TiB scanned (see https://cloud.google.com/bigquery/pricing#analysis_pricing_models).
 * A best-effort estimate only: ignores the free monthly tier, flat-rate/
 * reservation pricing, and any org-specific discount, matching the "honest
 * estimate, not fabricated precision" posture `QueryCostLogEntryModel`'s own
 * doc comment already established for this field.
 */
const ON_DEMAND_USD_PER_TEBIBYTE = 6.25;
const BYTES_PER_TEBIBYTE = 2 ** 40;

function estimateOnDemandCostUsd(bytesProcessed: number | undefined): number | null {
  if (bytesProcessed === undefined || !Number.isFinite(bytesProcessed) || bytesProcessed < 0) {
    return null;
  }
  return (bytesProcessed / BYTES_PER_TEBIBYTE) * ON_DEMAND_USD_PER_TEBIBYTE;
}

/**
 * BigQuery's `jobs.query` REST response (what `@google-cloud/bigquery`'s
 * `query()` convenience method calls under the hood for a simple query like
 * the ones this executor runs) includes `totalBytesProcessed` as a
 * stringified int64 alongside the rows — this reads it off the client's own
 * second tuple element ({@link BigQueryQueryClient}'s narrowed `apiResponse`
 * slot) without assuming any other shape from it.
 */
function extractBytesProcessed(response: unknown): number | undefined {
  if (!response || typeof response !== 'object') {
    return undefined;
  }
  const raw = (response as Record<string, unknown>).totalBytesProcessed;
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    return undefined;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * The exact option shape this executor passes to a BigQuery query call —
 * a narrowed subset of `@google-cloud/bigquery`'s own `Query` interface
 * (just the fields the compiler's output + KAN-18's dataset config need).
 */
export interface BigQueryQueryOptions {
  query: string;
  params?: Record<string, unknown>;
  defaultDataset?: { datasetId: string; projectId?: string };
  location?: string;
}

/**
 * The minimal slice of `@google-cloud/bigquery`'s `BigQuery` client this
 * executor depends on — narrowed to a single method so a test can inject a
 * fake client without a real GCP project or credentials, the same
 * "inject the client interface, not the SDK" convention this codebase's
 * other third-party integrations (Stripe, Google Ads, Meta) already use.
 */
export interface BigQueryQueryClient {
  query(options: BigQueryQueryOptions): Promise<[Record<string, unknown>[], unknown?]>;
}

/** Wraps a real `@google-cloud/bigquery` `BigQuery` instance behind {@link BigQueryQueryClient}. */
export function createRealBigQueryClient(projectId?: string): BigQueryQueryClient {
  const bigquery = new BigQuery(projectId ? { projectId } : undefined);
  return {
    query: (options) => bigquery.query(options) as unknown as Promise<[Record<string, unknown>[], unknown?]>,
  };
}

export interface BigQueryWarehouseQueryExecutorConfig {
  client: BigQueryQueryClient;
  /** Unqualified dataset the compiled SQL's unqualified table references (e.g. `fact_ad_spend`) resolve against — `growthos_core` per `infra/terraform/bigquery.tf`. The compiler is warehouse-provider-agnostic and never qualifies its own table names, so this executor supplies the dataset via BigQuery's `defaultDataset` query option rather than rewriting SQL. */
  dataset: string;
  /** Passed through as `defaultDataset.projectId` when the dataset lives in a different project than the client's own default. Omit to use the client's default project. */
  datasetProjectId?: string;
  /** BigQuery dataset location (e.g. `me-west1`, matching `infra/terraform/bigquery.tf`'s `var.region`) — required by BigQuery whenever it can't be inferred from an existing job/table reference. */
  location?: string;
}

/**
 * Real {@link WarehouseQueryExecutor} (KAN-18 phase 2): runs the compiler's
 * (KAN-41) already-built SQL string as a standard-SQL BigQuery query, with
 * `compiled.params` passed through as BigQuery named query parameters — the
 * compiler already emits `@param` placeholders for exactly this, so no
 * translation is needed beyond BigQuery's own type inference (a `string`
 * param infers `STRING`, a `readonly string[]` infers `ARRAY<STRING>`,
 * matching every `IN UNNEST(@param)` the compiler emits for an `in` filter).
 */
export class BigQueryWarehouseQueryExecutor implements WarehouseQueryExecutorWithStats {
  private readonly client: BigQueryQueryClient;

  private readonly dataset: string;

  private readonly datasetProjectId: string | undefined;

  private readonly location: string | undefined;

  constructor(config: BigQueryWarehouseQueryExecutorConfig) {
    this.client = config.client;
    this.dataset = config.dataset;
    this.datasetProjectId = config.datasetProjectId;
    this.location = config.location;
  }

  async execute(query: CompiledMetricQuery): Promise<WarehouseRow[]> {
    const { rows } = await this.runQuery(query);
    return rows;
  }

  async executeWithStats(query: CompiledMetricQuery): Promise<{ rows: WarehouseRow[]; stats: WarehouseQueryStats }> {
    const { rows, response } = await this.runQuery(query);
    return { rows, stats: { estimatedCostUsd: estimateOnDemandCostUsd(extractBytesProcessed(response)) } };
  }

  private async runQuery(query: CompiledMetricQuery): Promise<{ rows: WarehouseRow[]; response: unknown }> {
    let rawRows: Record<string, unknown>[];
    let response: unknown;
    try {
      [rawRows, response] = await this.client.query({
        query: query.sql,
        params: toBigQueryParams(query.params),
        defaultDataset: { datasetId: this.dataset, ...(this.datasetProjectId ? { projectId: this.datasetProjectId } : {}) },
        ...(this.location ? { location: this.location } : {}),
      });
    } catch (error) {
      // Every BigQuery-side rejection (table not found, unknown column,
      // permission, ...) surfaces as a typed error the board/goal degrade
      // paths already know how to render per-tile — see
      // WarehouseQueryFailedError's own doc comment. First hit for real the
      // moment the executor went live on dev (2026-08-19): most registered
      // metrics name mart tables dbt doesn't build yet, and each of those
      // would otherwise crash its whole board page.
      const message = error instanceof Error ? error.message : String(error);
      throw new WarehouseQueryFailedError(`BigQuery rejected the compiled metric query: ${message}`, error);
    }
    return { rows: rawRows.map(normalizeRow), response };
  }
}

function toBigQueryParams(params: Record<string, CompilerParamValue>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    normalized[key] = Array.isArray(value) ? [...value] : value;
  }
  return normalized;
}

/**
 * BigQuery's client library wraps `DATE`/`DATETIME`/`TIME`/`TIMESTAMP`
 * column values in typed objects (`BigQueryDate`, `BigQueryTimestamp`, ...)
 * rather than returning plain strings — every one of them exposes a
 * `.value` string. `WarehouseRow` only ever needs `string | number | null`
 * (it's rendered straight into chart/tile view-mappers that already handle
 * ISO date/timestamp strings), so this unwraps that shape rather than
 * making every downstream view-mapper BigQuery-type-aware.
 */
function normalizeValue(value: unknown): string | number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return value;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (typeof value === 'object' && 'value' in (value as Record<string, unknown>)) {
    const inner = (value as { value: unknown }).value;
    if (typeof inner === 'string' || typeof inner === 'number') {
      return inner;
    }
    return inner === null || inner === undefined ? null : String(inner);
  }
  return String(value);
}

function normalizeRow(row: Record<string, unknown>): WarehouseRow {
  const normalized: WarehouseRow = {};
  for (const [key, value] of Object.entries(row)) {
    normalized[key] = normalizeValue(value);
  }
  return normalized;
}
