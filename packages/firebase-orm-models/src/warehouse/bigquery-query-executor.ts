import { BigQuery } from '@google-cloud/bigquery';
import type { CompiledMetricQuery, CompilerParamValue } from '@growthos/shared';
import type { WarehouseQueryExecutor, WarehouseRow } from './query-executor';

/**
 * The BigQuery call this executor needs, kept as a small interface (not the
 * `@google-cloud/bigquery` package directly) so `BigQueryWarehouseQueryExecutor`
 * can be driven by a fake client in tests without any network access or real
 * GCP credentials — the same "buildable-today, swap the provider later" seam
 * `StripeApiClient`/`GoogleAdsApiClient` already established for their own
 * external-system boundaries.
 */
export interface BigQueryQueryClient {
  runQuery(query: CompiledMetricQuery): Promise<WarehouseRow[]>;
}

export interface BigQuerySdkQueryClientOptions {
  /** GCP project id the BigQuery jobs run (and are billed) under. */
  projectId: string;
  /** Must match the dataset's own location (`infra/terraform/bigquery.tf`'s `var.region`, e.g. `me-west1`) — BigQuery rejects a job whose location disagrees with the dataset it reads. */
  location: string;
  /** Unqualified dataset id every table in a compiled query's SQL resolves against (KAN-41's compiler emits bare identifiers like `` `fact_ad_spend` ``, never `project.dataset.table`) — `infra/terraform/bigquery.tf`'s `growthos_core` dataset holds the dbt-built (KAN-37) fact/entity tables the compiler assumes. */
  datasetId: string;
}

/** A compiled query's own bind-param values are always plain strings or string arrays (KAN-41's `CompilerParamValue`) — every param is typed `STRING`, or `ARRAY<STRING>` for an `IN UNNEST(@param)` array, regardless of what the underlying column type is; BigQuery coerces on comparison. */
function bigQueryParamTypes(params: Record<string, CompilerParamValue>): Record<string, string | string[]> {
  const types: Record<string, string | string[]> = {};
  for (const [name, value] of Object.entries(params)) {
    types[name] = Array.isArray(value) ? ['STRING'] : 'STRING';
  }
  return types;
}

/**
 * The real {@link BigQueryQueryClient} — a thin wrapper over
 * `@google-cloud/bigquery`'s own `BigQuery#query`, authenticating via
 * Application Default Credentials (the same posture
 * `connectFirestoreOrmAdmin` already uses for the Firebase Admin SDK: no
 * credential file in this repo, relies on the Cloud Run service identity in
 * production and `gcloud auth application-default login` locally). Never
 * exercised against a real BigQuery project by this repo's own test suite —
 * there is no live warehouse yet (KAN-18's `infra/terraform/bigquery.tf` is
 * not applied) — the same untested-in-CI posture `StripeHttpApiClient`/
 * `GoogleAdsHttpApiClient` already carry for their own real API clients.
 */
export class BigQuerySdkQueryClient implements BigQueryQueryClient {
  private readonly bigquery: BigQuery;
  private readonly projectId: string;
  private readonly location: string;
  private readonly datasetId: string;

  constructor(options: BigQuerySdkQueryClientOptions) {
    this.bigquery = new BigQuery({ projectId: options.projectId });
    this.projectId = options.projectId;
    this.location = options.location;
    this.datasetId = options.datasetId;
  }

  async runQuery(query: CompiledMetricQuery): Promise<WarehouseRow[]> {
    const [rows] = await this.bigquery.query({
      query: query.sql,
      params: query.params,
      types: bigQueryParamTypes(query.params),
      location: this.location,
      defaultDataset: { datasetId: this.datasetId, projectId: this.projectId },
    });
    return rows as WarehouseRow[];
  }
}

/**
 * The {@link WarehouseQueryExecutor} for a real, provisioned BigQuery
 * warehouse (KAN-18 phase 2) — delegates to a {@link BigQueryQueryClient} so
 * production wires a real {@link BigQuerySdkQueryClient} while tests wire a
 * fake one. `defaultWarehouseQueryExecutor` in `query-executor.ts` picks this
 * over `NotConfiguredWarehouseQueryExecutor` once `GROWTHOS_BIGQUERY_PROJECT_ID`
 * is set, with no caller (`queryMetrics` et al.) needing to change.
 */
export class BigQueryWarehouseQueryExecutor implements WarehouseQueryExecutor {
  constructor(private readonly client: BigQueryQueryClient) {}

  execute(query: CompiledMetricQuery): Promise<WarehouseRow[]> {
    return this.client.runQuery(query);
  }
}
