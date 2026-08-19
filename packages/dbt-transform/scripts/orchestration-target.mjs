// Decides which dbt target (`dev` = the buildable-today DuckDB fixture,
// `prod` = the real KAN-18 BigQuery warehouse) a scheduled orchestration run
// (KAN-38) should build against — purely from the environment, the same
// live/not-configured gate `readWarehouseEnvConfig`/
// `resolveWarehouseQueryExecutorFromEnv`
// (`packages/firebase-orm-models/src/warehouse/query-executor.ts`) already
// use to decide whether board tiles read from real BigQuery. Deliberately
// duplicated rather than imported: this package has no dependency on
// `@growthos/firebase-orm-models` (and shouldn't gain one just for a
// two-env-var check) — the same "duplicated deliberately, kept in sync by
// comment" posture `resolveDefaultQueryEnvironment` documents for its own
// lifted precedent.
//
// A human/deploy sets `GOOGLE_CLOUD_PROJECT` (or `GCLOUD_PROJECT`) +
// `GROWTHOS_BIGQUERY_CORE_DATASET` once `growthos_core` exists for real
// (KAN-18) — until both are present, orchestration keeps building the
// buildable-today DuckDB fixture, exactly as it always has, so CI (which
// never sets either) is unaffected.
export function resolveOrchestrationTarget(env = process.env) {
  const hasProjectId = Boolean(env.GOOGLE_CLOUD_PROJECT || env.GCLOUD_PROJECT);
  const hasDataset = Boolean(env.GROWTHOS_BIGQUERY_CORE_DATASET);
  return hasProjectId && hasDataset ? 'prod' : 'dev';
}
