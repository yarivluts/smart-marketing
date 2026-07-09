import type { IngestBatchInput } from './ingest.service';
import { ingestBatch } from './ingest.service';
import { EnvironmentModel } from '../models/environment.model';
import { ProjectModel } from '../models/project.model';
import { PluginInstallModel, type PluginInstallStatus } from '../models/plugin-install.model';
import { PluginSourceRunModel, type PluginSourceRunTrigger } from '../models/plugin-source-run.model';
import { ProjectNotFoundError } from './resource-library.service';
import { EnvironmentNotFoundError } from './key.service';
import { PluginInstallNotFoundError, getPluginManifestVersion, PluginManifestNotFoundError } from './plugin-registry.service';
import { recordAuditLogEntry } from './audit-log.service';
import {
  defaultSourcePluginExecutor,
  mintPluginRuntimeCredential,
  runWithRetryBackoff,
  type RetryBackoffOptions,
  type SourcePluginExecutor,
} from '../plugin-runtime';
import type { PluginType } from '@growthos/shared';

export class PluginInstallNotActiveError extends Error {
  constructor(public readonly currentStatus: PluginInstallStatus) {
    super(
      `Cannot run a plugin install that is currently "${currentStatus}". ` +
        (currentStatus === 'disabled' ? 'Enable it first.' : 'Install it again first.'),
    );
    this.name = 'PluginInstallNotActiveError';
  }
}

export class NotASourcePluginError extends Error {
  constructor(public readonly actualType: PluginType) {
    super(`Only a "source"-type plugin has a runnable sync — this install's manifest is type "${actualType}".`);
    this.name = 'NotASourcePluginError';
  }
}

/** Same load-bounding reasoning as `listOrchestrationRunsForProject` (KAN-38) — bounds query cost until a real aggregation store exists. */
export const DEFAULT_PLUGIN_SOURCE_RUN_LIST_LIMIT = 50;

const MANUAL_TRIGGER: PluginSourceRunTrigger = 'manual';

/** Retries a transient sync failure twice (3 attempts total) with a short exponential backoff — generous enough to ride out a flaky toy failure without making an interactive "Run now" click feel stuck for long. */
const DEFAULT_RETRY_OPTIONS: RetryBackoffOptions = { maxAttempts: 3, baseDelayMs: 200, factor: 2 };

async function requireProjectInOrg(organizationId: string, projectId: string): Promise<ProjectModel> {
  const project = await ProjectModel.init(projectId, { organization_id: organizationId });
  if (!project || project.organization_id !== organizationId) {
    throw new ProjectNotFoundError();
  }
  return project;
}

async function requireEnvironmentInProject(organizationId: string, projectId: string, environmentId: string): Promise<EnvironmentModel> {
  const environment = await EnvironmentModel.init(environmentId, { organization_id: organizationId, project_id: projectId });
  if (!environment || environment.project_id !== projectId) {
    throw new EnvironmentNotFoundError();
  }
  return environment;
}

async function requirePluginInstallInProject(organizationId: string, projectId: string, installId: string): Promise<PluginInstallModel> {
  const install = await PluginInstallModel.init(installId, { organization_id: organizationId, project_id: projectId });
  if (!install || install.organization_id !== organizationId || install.project_id !== projectId) {
    throw new PluginInstallNotFoundError();
  }
  return install;
}

function toIngestBatchInput(
  kind: IngestBatchInput['kind'],
  entityType: string | undefined,
  records: readonly Record<string, unknown>[],
): IngestBatchInput {
  if (kind === 'entity') {
    return { kind: 'entity', type: entityType ?? '', records };
  }
  return { kind, records };
}

export interface TriggerSourcePluginRunParams {
  organizationId: string;
  projectId: string;
  environmentId: string;
  installId: string;
  /** The human who triggered this run, if any — recorded on the run and, when present, audited. Omit for a future non-human caller (a real scheduler, once KAN-18/Cloud Run jobs exist). */
  triggeredByUserId?: string;
  /** Defaults to {@link defaultSourcePluginExecutor} — overridable so tests (and any future caller) can inject a fake executor. */
  executor?: SourcePluginExecutor;
  /** Defaults to {@link DEFAULT_RETRY_OPTIONS} — overridable so tests don't have to wait out real backoff delays. */
  retryOptions?: RetryBackoffOptions;
  /**
   * Skips this function's own install lookup when the caller already fetched
   * it (e.g. KAN-49's `runSourcePluginInstall`, which must inspect the
   * install's own `plugin_id` before deciding which executor to pass here) —
   * the same "fetch once, pass it through" posture `precomputedQuota`
   * (KAN-39) and `precomputedSchemaDefs` (KAN-36) already established for
   * their own equivalent duplicate-fetch seams. Re-validated against
   * `organizationId`/`projectId` regardless, so a caller can never bypass
   * isolation by passing in a mismatched install.
   */
  precomputedInstall?: PluginInstallModel;
}

/**
 * Manually triggers one incremental sync run for a source-plugin install
 * "right now" — KAN-47's buildable-today stand-in for "scheduled execution"
 * (a real Cloud Run job scheduler is deferred to KAN-18, the same posture
 * `triggerOrchestrationRun` (KAN-38) already established for its own
 * "scheduled runs" AC). Mints a scoped, short-lived runtime credential, reads
 * the install's own persisted cursor (so a fresh trigger after a restart
 * resumes exactly where the last successful run left off), runs the
 * executor with retry/backoff, and — for any record it produced — hands
 * them to `ingestBatch` (the exact same validation/dedup/quarantine path a
 * pushed Ingest API record goes through).
 *
 * Writes a `running` {@link PluginSourceRunModel} up front so a run is
 * visible mid-flight even if the process dies before the executor settles.
 * The install's own cursor is only advanced once the executor *and* landing
 * both succeed — a mid-run crash or a downstream `ingestBatch` failure
 * leaves the persisted cursor untouched, so the next trigger safely re-syncs
 * the same window rather than skipping past unlanded data (a resend of the
 * same records that direction is idempotent via `ingestBatch`'s own
 * client-id dedup).
 *
 * Never throws for an executor/landing failure — the run record itself
 * carries the outcome, the same "the record is the result" posture
 * `triggerOrchestrationRun` already uses — only for a request against a
 * project/environment/install that doesn't resolve in the caller's own org
 * (404-not-403, KAN-26), an install that isn't currently `installed`, or a
 * manifest whose type isn't `source`.
 */
export async function triggerSourcePluginRun(params: TriggerSourcePluginRunParams): Promise<PluginSourceRunModel> {
  await requireProjectInOrg(params.organizationId, params.projectId);
  const environment = await requireEnvironmentInProject(params.organizationId, params.projectId, params.environmentId);
  const precomputed = params.precomputedInstall;
  const install =
    precomputed &&
    precomputed.id === params.installId &&
    precomputed.organization_id === params.organizationId &&
    precomputed.project_id === params.projectId
      ? precomputed
      : await requirePluginInstallInProject(params.organizationId, params.projectId, params.installId);

  if (install.status !== 'installed') {
    throw new PluginInstallNotActiveError(install.status);
  }

  const manifest = await getPluginManifestVersion(params.organizationId, install.plugin_id, install.version);
  if (!manifest) {
    throw new PluginManifestNotFoundError();
  }
  if (manifest.type !== 'source') {
    throw new NotASourcePluginError(manifest.type);
  }

  const executor = params.executor ?? defaultSourcePluginExecutor;
  const retryOptions = params.retryOptions ?? DEFAULT_RETRY_OPTIONS;
  const credential = mintPluginRuntimeCredential(install);
  const cursorBefore = install.source_cursor ?? null;

  const run = new PluginSourceRunModel();
  run.organization_id = params.organizationId;
  run.project_id = params.projectId;
  run.plugin_install_id = install.id;
  run.environment_id = environment.id;
  run.status = 'running';
  run.trigger = MANUAL_TRIGGER;
  if (params.triggeredByUserId !== undefined) {
    run.triggered_by_user_id = params.triggeredByUserId;
  }
  run.started_at = new Date().toISOString();
  run.attempts = 0;
  run.cursor_before = cursorBefore;
  run.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
  await run.save();

  let lastAttempt = 0;
  try {
    const { result, attempts } = await runWithRetryBackoff((attempt) => {
      lastAttempt = attempt;
      return executor.sync({
        organizationId: params.organizationId,
        projectId: params.projectId,
        pluginId: install.plugin_id,
        config: install.config,
        credential,
        cursor: cursorBefore,
      });
    }, retryOptions);

    run.attempts = attempts;
    run.cursor_after = result.nextCursor;
    run.record_kind = result.kind;
    run.records_fetched = result.records.length;

    if (result.records.length > 0) {
      const summary = await ingestBatch({
        organizationId: params.organizationId,
        projectId: params.projectId,
        environmentId: environment.id,
        input: toIngestBatchInput(result.kind, result.entityType, result.records),
      });
      run.records_accepted = summary.accepted;
      run.records_quarantined = summary.quarantined;
      run.records_duplicate = summary.duplicates;
    } else {
      run.records_accepted = 0;
      run.records_quarantined = 0;
      run.records_duplicate = 0;
    }

    run.status = 'succeeded';
    run.finished_at = new Date().toISOString();

    if (result.nextCursor !== null) {
      install.source_cursor = result.nextCursor;
    }
    install.source_last_synced_at = run.finished_at;
    await install.save();
  } catch (error) {
    run.attempts = lastAttempt;
    run.status = 'failed';
    run.finished_at = new Date().toISOString();
    run.error_message = error instanceof Error ? error.message : String(error);
  }
  await run.save();

  await recordSourcePluginRunAudit(params.organizationId, params.projectId, run, params.triggeredByUserId);
  return run;
}

/** Best-effort audit entry for one triggered run — see `recordAuditLogEntry`'s own doc comment for why a failure here is swallowed rather than propagated. Skipped entirely when there's no human actor, same posture `recordOrchestrationRunAudit` already uses for its own optional actor param. */
async function recordSourcePluginRunAudit(
  organizationId: string,
  projectId: string,
  run: PluginSourceRunModel,
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
      action: 'plugin_source_run.trigger',
      targetType: 'plugin_install',
      targetId: run.plugin_install_id,
      summary: `Triggered a source-plugin sync run -> ${run.status}`,
      after: run.error_message !== undefined ? { status: run.status, errorMessage: run.error_message } : { status: run.status },
    });
  } catch {
    // Best-effort — see recordAuditLogEntry's own doc comment.
  }
}

/**
 * One plugin install's sync run history, newest-first, bounded to `limit`.
 * Two equality filters (`organization_id`/`project_id`, via the path itself)
 * plus one more (`plugin_install_id`) plus an `orderBy` on a fourth field
 * (`started_at`) needs a composite index in real (non-emulator) Firestore,
 * the same documented requirement `listRawRecordsForSchemaSince` (KAN-36)
 * already carries for its own equivalent query shape.
 */
export async function listSourcePluginRunsForInstall(
  organizationId: string,
  projectId: string,
  installId: string,
  limit: number = DEFAULT_PLUGIN_SOURCE_RUN_LIST_LIMIT,
): Promise<PluginSourceRunModel[]> {
  return PluginSourceRunModel.initPath({ organization_id: organizationId, project_id: projectId })
    .where('plugin_install_id', '==', installId)
    .orderBy('started_at', 'desc')
    .limit(limit)
    .get();
}
