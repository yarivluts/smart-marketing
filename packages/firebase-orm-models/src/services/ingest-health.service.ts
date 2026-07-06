import { IngestBatchModel } from '../models/ingest-batch.model';

/**
 * How many of a project's most recent ingest batches the health rollup
 * considers. `ingest_batches` has no pagination/aggregation infra yet (that's
 * KAN-33/34 territory — a real warehouse table would answer "throughput over
 * the last 24h" without fetching documents at all), so this bounds query cost
 * in the meantime. The UI surfaces this cap explicitly rather than silently
 * presenting a partial rollup as complete.
 */
export const DEFAULT_INGEST_HEALTH_BATCH_LIMIT = 200;

/**
 * The most recent ingest batches for a project, newest first (KAN-35: ingest
 * health throughput/error-rate/freshness rollup + quarantine browser). Not
 * scoped to one environment — a project's dev/staging/prod batches are all
 * folded into one view, same as KAN-30's keys page listing every
 * environment's keys together with an environment label per row.
 */
export async function listRecentIngestBatchesForProject(
  organizationId: string,
  projectId: string,
  limit: number = DEFAULT_INGEST_HEALTH_BATCH_LIMIT,
): Promise<IngestBatchModel[]> {
  return IngestBatchModel.initPath({ organization_id: organizationId, project_id: projectId })
    .query()
    .orderBy('created_at', 'desc')
    .limit(limit)
    .get();
}
