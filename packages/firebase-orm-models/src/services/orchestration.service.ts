import { OrchestrationRunModel, type OrchestrationRunTrigger } from '../models/orchestration-run.model';
import { ProjectModel } from '../models/project.model';
import { ProjectNotFoundError } from './resource-library.service';
import { recordAuditLogEntry } from './audit-log.service';
import { defaultOrchestrationExecutor, type OrchestrationExecutor } from '../orchestration';

/** Same load-bounding reasoning as `listRecentIngestBatchesForProject` (KAN-35) — bounds query cost until a real aggregation store exists. */
export const DEFAULT_ORCHESTRATION_RUN_LIST_LIMIT = 50;

const MANUAL_TRIGGER: OrchestrationRunTrigger = 'manual';

async function requireProjectInOrg(organizationId: string, projectId: string): Promise<ProjectModel> {
  const project = await ProjectModel.init(projectId, { organization_id: organizationId });
  if (!project || project.organization_id !== organizationId) {
    throw new ProjectNotFoundError();
  }
  return project;
}

export interface TriggerOrchestrationRunParams {
  organizationId: string;
  projectId: string;
  /** The human who triggered this run, if any — recorded on the run and, when present, audited. Omit for a future non-human caller (a real scheduler, once KAN-18 exists). */
  triggeredByUserId?: string;
  /** Defaults to {@link defaultOrchestrationExecutor} — overridable so tests (and any future caller) can inject a fake executor without a real dbt subprocess. */
  executor?: OrchestrationExecutor;
}

/**
 * Manually triggers one orchestration run for a project "right now" —
 * KAN-38's buildable-today stand-in for "scheduled runs per project" (see
 * `orchestration/executor.ts`'s own doc comment for why a real
 * cron/Cloud-Workflows trigger is deferred until KAN-18 provisions
 * somewhere to run one). Writes an `OrchestrationRunModel` up front
 * (`status: 'running'`) so a run is visible mid-flight even if the process
 * dies before the executor settles, then updates it to `succeeded` (with
 * freshness metadata written back — the AC's other half) or `failed` (with
 * the executor's own error message) once it does.
 *
 * Never throws for an executor failure — the run record itself carries the
 * outcome, the same "the record is the result" posture
 * `replayQuarantinedRecord`'s `still_quarantined` outcome already uses —
 * only for a request against a project that doesn't exist in the caller's
 * own org (KAN-26: a 404-not-403 lookup, same as every other project-scoped
 * service in this package).
 */
export async function triggerOrchestrationRun(params: TriggerOrchestrationRunParams): Promise<OrchestrationRunModel> {
  await requireProjectInOrg(params.organizationId, params.projectId);
  const executor = params.executor ?? defaultOrchestrationExecutor;

  const run = new OrchestrationRunModel();
  run.organization_id = params.organizationId;
  run.project_id = params.projectId;
  run.status = 'running';
  run.trigger = MANUAL_TRIGGER;
  if (params.triggeredByUserId !== undefined) {
    run.triggered_by_user_id = params.triggeredByUserId;
  }
  run.started_at = new Date().toISOString();
  run.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
  await run.save();

  try {
    const result = await executor.run({ organizationId: params.organizationId, projectId: params.projectId });
    run.status = 'succeeded';
    run.finished_at = new Date().toISOString();
    run.freshness = result.freshness.map((entry) => ({
      table: entry.table,
      row_count: entry.rowCount,
      latest_record_at: entry.latestRecordAt,
    }));
  } catch (error) {
    run.status = 'failed';
    run.finished_at = new Date().toISOString();
    run.error_message = error instanceof Error ? error.message : String(error);
  }
  await run.save();

  await recordOrchestrationRunAudit(params.organizationId, params.projectId, run, params.triggeredByUserId);
  return run;
}

/** Best-effort audit entry for one triggered run — see `recordAuditLogEntry`'s own doc comment for why a failure here is swallowed rather than propagated. Skipped entirely when there's no human actor (a future non-human caller), the same "no synthetic system actor for a real admin-triggered surface" posture `replayFailedPipelineMessagesForProject` already uses for its own optional actor param. */
async function recordOrchestrationRunAudit(
  organizationId: string,
  projectId: string,
  run: OrchestrationRunModel,
  performedByUserId: string | undefined,
): Promise<void> {
  if (!performedByUserId) {
    return;
  }
  try {
    await recordAuditLogEntry({
      organizationId,
      projectId,
      actorType: 'user',
      actorId: performedByUserId,
      action: 'orchestration_run.trigger',
      targetType: 'orchestration_run',
      targetId: run.id,
      summary: `Triggered an orchestration run for the project -> ${run.status}`,
      after: run.error_message !== undefined ? { status: run.status, errorMessage: run.error_message } : { status: run.status },
    });
  } catch {
    // Best-effort — see recordAuditLogEntry's own doc comment.
  }
}

/**
 * A project's orchestration run history, newest-first (KAN-38's "way to read
 * back run history" half of the AC). Not scoped to one environment — the
 * underlying dbt build already runs across every environment in one pass,
 * same "fold every environment into one admin view" posture as
 * `listRecentIngestBatchesForProject`.
 */
export async function listOrchestrationRunsForProject(
  organizationId: string,
  projectId: string,
  limit: number = DEFAULT_ORCHESTRATION_RUN_LIST_LIMIT,
): Promise<OrchestrationRunModel[]> {
  return OrchestrationRunModel.initPath({ organization_id: organizationId, project_id: projectId })
    .query()
    .orderBy('started_at', 'desc')
    .limit(limit)
    .get();
}
