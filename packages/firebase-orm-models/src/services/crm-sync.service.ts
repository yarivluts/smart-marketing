import type { PluginType } from '@growthos/shared';
import { ProjectModel } from '../models/project.model';
import { PluginInstallModel } from '../models/plugin-install.model';
import { PluginSinkRunModel } from '../models/plugin-sink-run.model';
import { SharedCredentialModel } from '../models/shared-credential.model';
import type { KmsProvider } from '../vault';
import {
  CRM_WEBHOOK_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD,
  CRM_WEBHOOK_PLUGIN_ID,
  CrmWebhookHttpApiClient,
  CrmWebhookSinkPluginExecutor,
  parseCrmWebhookCredentialSecret,
  type CrmWebhookCredentialSecret,
} from '../plugin-runtime/crm-webhook';
import { mintPluginRuntimeCredential, runWithRetryBackoff, type RetryBackoffOptions, type SinkPluginExecutor } from '../plugin-runtime';
import { ProjectNotFoundError, listActiveAttachmentsForProject } from './resource-library.service';
import { PluginInstallNotFoundError, getPluginManifestVersion, PluginManifestNotFoundError } from './plugin-registry.service';
import { CredentialSecretNotSetError, revealSharedCredentialSecret } from './vault.service';
import { listSegmentMembers, type SegmentMemberListOutcome } from './segment.service';
import { recordAuditLogEntry } from './audit-log.service';
import type { WarehouseQueryExecutor } from '../warehouse/query-executor';
// Reused as-is from the source-side runtime (KAN-47) — "this install isn't installed" is the exact
// same failure mode regardless of sync direction. Not re-exported here (that would collide with
// `plugin-runtime.service.ts`'s own `export *` of the same class from the package barrel) — a caller
// imports it from wherever it already does today.
import { PluginInstallNotActiveError } from './plugin-runtime.service';

export class NotAnActionPluginError extends Error {
  constructor(public readonly actualType: PluginType) {
    super(`Only an "action"-type plugin can be synced to — this install's manifest is type "${actualType}".`);
    this.name = 'NotAnActionPluginError';
  }
}

/** An install claims to be (or was resolved as) the built-in CRM webhook plugin, but isn't configured with a usable credential yet — mirrors `StripeCredentialConfigError`'s exact "collapse every failure mode to one honest story" posture. */
export class CrmWebhookCredentialConfigError extends Error {
  constructor(public readonly reason: string) {
    super(`This install is not correctly configured to sync to a CRM yet: ${reason}`);
    this.name = 'CrmWebhookCredentialConfigError';
  }
}

/** A segment's member list couldn't be resolved (warehouse not configured, quota exceeded, or a query error) — surfaced as a typed error so `syncSegmentToCrm` can record it on the run the same way an executor failure is, rather than crashing outright. */
export class SegmentMembersUnavailableError extends Error {
  constructor(public readonly outcome: Extract<SegmentMemberListOutcome, { ok: false }>) {
    super(outcome.message);
    this.name = 'SegmentMembersUnavailableError';
  }
}

async function requireProjectInOrg(organizationId: string, projectId: string): Promise<ProjectModel> {
  const project = await ProjectModel.init(projectId, { organization_id: organizationId });
  if (!project || project.organization_id !== organizationId) {
    throw new ProjectNotFoundError();
  }
  return project;
}

async function requirePluginInstallInProject(organizationId: string, projectId: string, installId: string): Promise<PluginInstallModel> {
  const install = await PluginInstallModel.init(installId, { organization_id: organizationId, project_id: projectId });
  if (!install || install.organization_id !== organizationId || install.project_id !== projectId) {
    throw new PluginInstallNotFoundError();
  }
  return install;
}

/**
 * Resolves the CRM webhook secret (destination URL + bearer token) an
 * install's `crm_webhook_credential_attachment_id` config points at: an
 * *approved* `credential`-kind resource attachment (KAN-27) whose
 * `SharedCredentialModel.provider` is `'generic'`, decrypted via the vault
 * (KAN-29). Mirrors `resolveStripeCredentialSecret`'s exact resolution path,
 * one connector removed.
 */
export async function resolveCrmWebhookCredentialSecret(
  organizationId: string,
  projectId: string,
  install: PluginInstallModel,
  kms: KmsProvider,
): Promise<CrmWebhookCredentialSecret> {
  const attachmentId = install.config[CRM_WEBHOOK_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD];
  if (typeof attachmentId !== 'string' || attachmentId.trim().length === 0) {
    throw new CrmWebhookCredentialConfigError(`missing "${CRM_WEBHOOK_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD}" config`);
  }

  const attachments = await listActiveAttachmentsForProject(organizationId, projectId);
  const attachment = attachments.find((entry) => entry.id === attachmentId && entry.resource_kind === 'credential');
  if (!attachment) {
    throw new CrmWebhookCredentialConfigError('no approved credential attachment matches the configured id');
  }

  const credential = await SharedCredentialModel.init(attachment.resource_id, { organization_id: organizationId });
  if (!credential || credential.provider !== 'generic') {
    throw new CrmWebhookCredentialConfigError('the attached credential is not a generic credential');
  }

  try {
    const raw = await revealSharedCredentialSecret({ organizationId, credentialId: attachment.resource_id, kms });
    return parseCrmWebhookCredentialSecret(raw);
  } catch (error) {
    if (error instanceof CredentialSecretNotSetError) {
      throw new CrmWebhookCredentialConfigError('the attached credential has no secret set yet');
    }
    throw error;
  }
}

/** Retries a transient push failure twice (3 attempts total) — the same posture `plugin-runtime.service.ts`'s own `DEFAULT_RETRY_OPTIONS` establishes for the inbound direction. */
const DEFAULT_RETRY_OPTIONS: RetryBackoffOptions = { maxAttempts: 3, baseDelayMs: 200, factor: 2 };

export interface SyncSegmentToCrmParams {
  organizationId: string;
  projectId: string;
  segmentId: string;
  installId: string;
  /** The human who triggered this run — always present today (this action has no non-human trigger yet), recorded on the run and audited. */
  triggeredByUserId: string;
  /** Same semantics as `ListSegmentMembersParams.environmentId`. */
  environmentId?: string;
  kms: KmsProvider;
  /** Overridable so tests can inject a fake executor without a real HTTP call. */
  executor?: SinkPluginExecutor;
  /** Passed straight through to the internal `listSegmentMembers` call — overridable so tests can inject a fake warehouse executor without a real BigQuery connection, the same posture `ListSegmentMembersParams.executor` itself establishes. */
  membersExecutor?: WarehouseQueryExecutor;
  retryOptions?: RetryBackoffOptions;
}

/**
 * Pushes one saved segment's own currently-matching entity rows out to a
 * configured action-type plugin install "right now" (KAN-81, plan `14 §Gap
 * 5`: "export/sync to CRM ... action plugin") — the outbound mirror of
 * `triggerSourcePluginRun`. Resolves the segment's live member list
 * (`listSegmentMembers`), builds a real `CrmWebhookSinkPluginExecutor`
 * against the install's own configured credential (mirroring
 * `runSourcePluginInstall`'s per-connector dispatch, one connector so far),
 * and pushes with the same retry/backoff posture the source-side runtime
 * already established.
 *
 * Both the executor (credential resolution) and the segment's member list are
 * resolved *before* any {@link PluginSinkRunModel} is written, and in that
 * order: a misconfigured install (bad/missing credential) is a genuinely
 * invalid request and should fail the same clean way regardless of whether
 * the warehouse happens to be reachable, so it's checked first and throws
 * straight through rather than risking being masked by an unrelated degraded
 * member-list outcome. A segment id that doesn't resolve in the caller's own
 * org likewise throws `SegmentNotFoundError` straight through (404-not-403,
 * KAN-26), the same "validate the request before starting work" split
 * `triggerSourcePluginRun` already draws for its own project/environment/
 * install lookups. Once a run *is* created, it never throws for a degraded
 * member list or a push failure — the run record itself carries the outcome,
 * the same "the record is the result" posture `triggerSourcePluginRun`
 * already established.
 */
export async function syncSegmentToCrm(params: SyncSegmentToCrmParams): Promise<PluginSinkRunModel> {
  await requireProjectInOrg(params.organizationId, params.projectId);
  const install = await requirePluginInstallInProject(params.organizationId, params.projectId, params.installId);

  if (install.status !== 'installed') {
    throw new PluginInstallNotActiveError(install.status);
  }

  const manifest = await getPluginManifestVersion(params.organizationId, install.plugin_id, install.version);
  if (!manifest) {
    throw new PluginManifestNotFoundError();
  }
  if (manifest.type !== 'action') {
    throw new NotAnActionPluginError(manifest.type);
  }

  const executor = params.executor ?? (await defaultCrmSinkExecutorFor(params.organizationId, params.projectId, install, params.kms));

  const membersOutcome = await listSegmentMembers({
    organizationId: params.organizationId,
    projectId: params.projectId,
    segmentId: params.segmentId,
    environmentId: params.environmentId,
    executor: params.membersExecutor,
  });

  const run = new PluginSinkRunModel();
  run.organization_id = params.organizationId;
  run.project_id = params.projectId;
  run.plugin_install_id = install.id;
  run.segment_id = params.segmentId;
  run.status = 'running';
  run.triggered_by_user_id = params.triggeredByUserId;
  run.started_at = new Date().toISOString();
  run.records_attempted = membersOutcome.ok ? membersOutcome.members.length : 0;
  run.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
  await run.save();

  try {
    if (!membersOutcome.ok) {
      throw new SegmentMembersUnavailableError(membersOutcome);
    }

    const records = membersOutcome.members.map((member) => ({ entity_id: member.entityId, properties: member.properties, last_seen_at: member.lastSeenAt }));
    const retryOptions = params.retryOptions ?? DEFAULT_RETRY_OPTIONS;
    const credential = mintPluginRuntimeCredential(install);

    const { result, attempts } = await runWithRetryBackoff(
      () =>
        executor.push({
          organizationId: params.organizationId,
          projectId: params.projectId,
          pluginId: install.plugin_id,
          config: install.config,
          credential,
          records,
        }),
      retryOptions,
    );
    run.attempts = attempts;
    run.records_pushed = result.pushed;
    run.status = 'succeeded';
    run.finished_at = new Date().toISOString();
  } catch (error) {
    run.status = 'failed';
    run.finished_at = new Date().toISOString();
    run.error_message = error instanceof Error ? error.message : String(error);
  }
  await run.save();

  await recordCrmSyncRunAudit(params.organizationId, params.projectId, run, params.triggeredByUserId);
  return run;
}

/** The only built-in sink connector today — resolves its credential and builds a real `CrmWebhookSinkPluginExecutor`, the exact "Run now"-time dispatch `runSourcePluginInstall` (KAN-49/52) already established for the inbound direction, one connector so far. Extracted so a test can override `executor` directly instead of round-tripping through the vault. */
async function defaultCrmSinkExecutorFor(organizationId: string, projectId: string, install: PluginInstallModel, kms: KmsProvider): Promise<SinkPluginExecutor> {
  if (install.plugin_id !== CRM_WEBHOOK_PLUGIN_ID) {
    throw new CrmWebhookCredentialConfigError('this install is not a recognized action plugin with a built-in executor');
  }
  const { webhookUrl, bearerToken } = await resolveCrmWebhookCredentialSecret(organizationId, projectId, install, kms);
  return new CrmWebhookSinkPluginExecutor({ apiClient: new CrmWebhookHttpApiClient(), webhookUrl, bearerToken });
}

/** Best-effort audit entry for one triggered sync — see `recordAuditLogEntry`'s own doc comment for why a failure here is swallowed rather than propagated. */
async function recordCrmSyncRunAudit(organizationId: string, projectId: string, run: PluginSinkRunModel, performedByUserId: string): Promise<void> {
  try {
    await recordAuditLogEntry({
      organizationId,
      projectId,
      actorType: 'user',
      actorId: performedByUserId,
      action: 'plugin_sink_run.trigger',
      targetType: 'segment',
      targetId: run.segment_id,
      summary: `Synced segment to CRM -> ${run.status}`,
      after: run.error_message !== undefined ? { status: run.status, errorMessage: run.error_message } : { status: run.status, recordsPushed: run.records_pushed },
    });
  } catch {
    // Best-effort — see recordAuditLogEntry's own doc comment.
  }
}

/** Same load-bounding reasoning as `DEFAULT_PLUGIN_SOURCE_RUN_LIST_LIMIT` (KAN-47) — bounds query cost until a real aggregation store exists. */
export const DEFAULT_PLUGIN_SINK_RUN_LIST_LIMIT = 50;

/** One segment's CRM-sync run history, newest-first, bounded to `limit` — the outbound mirror of `listSourcePluginRunsForInstall`. */
export async function listCrmSyncRunsForSegment(organizationId: string, projectId: string, segmentId: string, limit: number = DEFAULT_PLUGIN_SINK_RUN_LIST_LIMIT): Promise<PluginSinkRunModel[]> {
  await requireProjectInOrg(organizationId, projectId);
  const runs = await PluginSinkRunModel.initPath({ organization_id: organizationId, project_id: projectId })
    .where('project_id', '==', projectId)
    .where('segment_id', '==', segmentId)
    .get();
  return runs.sort((a, b) => b.started_at.localeCompare(a.started_at)).slice(0, limit);
}

/** Every currently-`installed`, `action`-type plugin install in a project — the pick-list `syncSegmentToCrm`'s own UI needs (there is no "list action installs" query yet; every existing list helper is either "all installs" or scoped to source-run history). */
export async function listActionPluginInstallsForProject(organizationId: string, projectId: string): Promise<PluginInstallModel[]> {
  await requireProjectInOrg(organizationId, projectId);
  const installs = await PluginInstallModel.initPath({ organization_id: organizationId, project_id: projectId })
    .where('project_id', '==', projectId)
    .where('status', '==', 'installed')
    .get();

  const manifestTypeByPluginVersion = new Map<string, PluginType>();
  const actionInstalls: PluginInstallModel[] = [];
  for (const install of installs) {
    const key = `${install.plugin_id}@${install.version}`;
    let type = manifestTypeByPluginVersion.get(key);
    if (type === undefined) {
      const manifest = await getPluginManifestVersion(organizationId, install.plugin_id, install.version);
      type = manifest?.type;
      if (type !== undefined) {
        manifestTypeByPluginVersion.set(key, type);
      }
    }
    if (type === 'action') {
      actionInstalls.push(install);
    }
  }
  return actionInstalls;
}
