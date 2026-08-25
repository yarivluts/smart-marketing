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
import {
  META_CUSTOM_AUDIENCE_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD,
  META_CUSTOM_AUDIENCE_NAME_CONFIG_FIELD,
  META_CUSTOM_AUDIENCE_PLUGIN_ID,
  MetaCustomAudienceSinkPluginExecutor,
} from '../plugin-runtime/meta-custom-audience';
import {
  GOOGLE_CUSTOMER_MATCH_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD,
  GOOGLE_CUSTOMER_MATCH_NAME_CONFIG_FIELD,
  GOOGLE_CUSTOMER_MATCH_PLUGIN_ID,
  GoogleCustomerMatchSinkPluginExecutor,
} from '../plugin-runtime/google-customer-match';
import { MetaAdsHttpApiClient } from '../plugin-runtime/meta-ads';
import { GoogleAdsHttpApiClient } from '../plugin-runtime/google-ads';
import { mintPluginRuntimeCredential, runWithRetryBackoff, type RetryBackoffOptions, type SinkPluginExecutor } from '../plugin-runtime';
import { ProjectNotFoundError, listActiveAttachmentsForProject } from './resource-library.service';
import { PluginInstallNotFoundError, getPluginManifestVersion, PluginManifestNotFoundError } from './plugin-registry.service';
import { CredentialSecretNotSetError, revealSharedCredentialSecret } from './vault.service';
import { MetaAdsCredentialConfigError, resolveMetaAdsCredentialSecret } from './meta-ads-plugin.service';
import { GoogleAdsCredentialConfigError, resolveGoogleAdsCredentialSecret } from './google-ads-plugin.service';
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

/** The Meta Custom Audience sibling of {@link CrmWebhookCredentialConfigError} — an install claims to be (or was resolved as) the built-in Meta Custom Audience plugin, but isn't configured with a usable Meta Ads credential or audience name yet. */
export class MetaAudienceCredentialConfigError extends Error {
  constructor(public readonly reason: string) {
    super(`This install is not correctly configured to sync to a Meta Custom Audience yet: ${reason}`);
    this.name = 'MetaAudienceCredentialConfigError';
  }
}

/** The Google Ads Customer Match sibling of {@link MetaAudienceCredentialConfigError} (KAN-72 follow-up) — an install claims to be (or was resolved as) the built-in Google Customer Match plugin, but isn't configured with a usable Google Ads credential or user list name yet. */
export class GoogleCustomerMatchCredentialConfigError extends Error {
  constructor(public readonly reason: string) {
    super(`This install is not correctly configured to sync to a Google Ads Customer Match list yet: ${reason}`);
    this.name = 'GoogleCustomerMatchCredentialConfigError';
  }
}

/** An action-type install's `plugin_id` doesn't match any built-in connector this codebase actually knows how to sync to (`CRM_WEBHOOK_PLUGIN_ID`/`META_CUSTOM_AUDIENCE_PLUGIN_ID`/`GOOGLE_CUSTOMER_MATCH_PLUGIN_ID` today) — e.g. a third-party manifest registered and installed through the generic Plugin Registry flow (KAN-46) with no real runtime behind it yet, the same "installable but not runnable" gap `runSourcePluginInstall`'s own inbound dispatch would hit for an unrecognized source plugin. */
export class UnsupportedSinkPluginError extends Error {
  constructor(public readonly pluginId: string) {
    super(`No built-in sync executor exists for plugin "${pluginId}" yet.`);
    this.name = 'UnsupportedSinkPluginError';
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

export interface MetaAudienceSyncSecret {
  accessToken: string;
  adAccountId: string;
  audienceName: string;
}

/**
 * Resolves what `MetaCustomAudienceSinkPluginExecutor` needs to sync a
 * segment to Meta: the Meta Ads access token + ad account id an install's
 * `meta_custom_audience_credential_attachment_id` config points at (via the
 * *approved* `provider: 'meta_ads'` credential attachment, decrypted through
 * `resolveMetaAdsCredentialSecret` — the exact same resolution KAN-73's own
 * Meta Manage plugin already established, reused as-is rather than
 * duplicating credential decryption for a second Meta connector), plus the
 * install's own configured `audience_name`. Mirrors
 * `resolveCrmWebhookCredentialSecret`'s exact "collapse every failure mode
 * into one error type" shape, one connector over.
 */
export async function resolveMetaAudienceCredentialSecret(
  organizationId: string,
  projectId: string,
  install: PluginInstallModel,
  kms: KmsProvider,
): Promise<MetaAudienceSyncSecret> {
  const attachmentId = install.config[META_CUSTOM_AUDIENCE_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD];
  if (typeof attachmentId !== 'string' || attachmentId.trim().length === 0) {
    throw new MetaAudienceCredentialConfigError(`missing "${META_CUSTOM_AUDIENCE_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD}" config`);
  }
  const audienceName = install.config[META_CUSTOM_AUDIENCE_NAME_CONFIG_FIELD];
  if (typeof audienceName !== 'string' || audienceName.trim().length === 0) {
    throw new MetaAudienceCredentialConfigError(`missing "${META_CUSTOM_AUDIENCE_NAME_CONFIG_FIELD}" config`);
  }

  const attachments = await listActiveAttachmentsForProject(organizationId, projectId);
  const attachment = attachments.find((entry) => entry.id === attachmentId && entry.resource_kind === 'credential');
  if (!attachment) {
    throw new MetaAudienceCredentialConfigError('no approved credential attachment matches the configured id');
  }

  try {
    const { accessToken, adAccountId } = await resolveMetaAdsCredentialSecret(organizationId, attachment, kms);
    return { accessToken, adAccountId, audienceName };
  } catch (error) {
    if (error instanceof MetaAdsCredentialConfigError) {
      throw new MetaAudienceCredentialConfigError(error.reason);
    }
    throw error;
  }
}

export interface GoogleCustomerMatchSyncSecret {
  developerToken: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  customerId: string;
  loginCustomerId?: string;
  userListName: string;
}

/**
 * The Google Ads Customer Match sibling of {@link resolveMetaAudienceCredentialSecret}
 * (KAN-72 follow-up, plan `13 §E21.2`'s own deferred "audience attach" bullet):
 * resolves what `GoogleCustomerMatchSinkPluginExecutor` needs to sync a
 * segment to Google Ads — the OAuth app credentials, refresh token,
 * developer token, and target customer id an install's
 * `google_customer_match_credential_attachment_id` config points at (via
 * the *approved* `provider: 'google_ads'` credential attachment, decrypted
 * through `resolveGoogleAdsCredentialSecret` — the exact same resolution
 * KAN-72's own Google Ads Manage plugin already established, reused as-is
 * rather than duplicating credential decryption for a second Google Ads
 * connector), plus the install's own configured `user_list_name`.
 */
export async function resolveGoogleCustomerMatchCredentialSecret(
  organizationId: string,
  projectId: string,
  install: PluginInstallModel,
  kms: KmsProvider,
): Promise<GoogleCustomerMatchSyncSecret> {
  const attachmentId = install.config[GOOGLE_CUSTOMER_MATCH_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD];
  if (typeof attachmentId !== 'string' || attachmentId.trim().length === 0) {
    throw new GoogleCustomerMatchCredentialConfigError(`missing "${GOOGLE_CUSTOMER_MATCH_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD}" config`);
  }
  const userListName = install.config[GOOGLE_CUSTOMER_MATCH_NAME_CONFIG_FIELD];
  if (typeof userListName !== 'string' || userListName.trim().length === 0) {
    throw new GoogleCustomerMatchCredentialConfigError(`missing "${GOOGLE_CUSTOMER_MATCH_NAME_CONFIG_FIELD}" config`);
  }

  const attachments = await listActiveAttachmentsForProject(organizationId, projectId);
  const attachment = attachments.find((entry) => entry.id === attachmentId && entry.resource_kind === 'credential');
  if (!attachment) {
    throw new GoogleCustomerMatchCredentialConfigError('no approved credential attachment matches the configured id');
  }

  try {
    const secret = await resolveGoogleAdsCredentialSecret(organizationId, attachment, kms);
    return { ...secret, userListName };
  } catch (error) {
    if (error instanceof GoogleAdsCredentialConfigError) {
      throw new GoogleCustomerMatchCredentialConfigError(error.reason);
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
 * `triggerSourcePluginRun`. Despite its CRM-specific name (kept to avoid
 * rippling a rename through every existing caller/route/test), this is the
 * one generic entry point the Segments page's "Sync" picker always calls
 * regardless of which action-type plugin was chosen — `apps/web`'s picker
 * already lists every installed action plugin, not just the CRM webhook one.
 * Resolves the segment's live member list (`listSegmentMembers`), builds the
 * right real `SinkPluginExecutor` for the install's own `plugin_id`
 * (`defaultSinkExecutorForInstall` — `CrmWebhookSinkPluginExecutor`, or since
 * the KAN-73 follow-up `MetaCustomAudienceSinkPluginExecutor`, or since the
 * KAN-72 follow-up `GoogleCustomerMatchSinkPluginExecutor` too, mirroring
 * `runSourcePluginInstall`'s own per-connector dispatch for the inbound
 * direction), and pushes with the same retry/backoff posture the source-side
 * runtime already established.
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

  const executor = params.executor ?? (await defaultSinkExecutorForInstall(params.organizationId, params.projectId, install, params.kms));

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

    // Persist a connector-created external resource id (e.g. a newly-created Meta Custom
    // Audience, or a Google Ads Customer Match user list) so the *next* sync reuses it instead of
    // creating a duplicate — see `SinkPluginPushResult.externalRef`'s own doc comment. A no-op for
    // a connector (e.g. CRM webhook) that never sets `externalRef`, and for a repeat sync that
    // already reused the same id.
    if (result.externalRef !== undefined && install.sink_external_ref !== result.externalRef) {
      install.sink_external_ref = result.externalRef;
      await install.save();
    }
  } catch (error) {
    run.status = 'failed';
    run.finished_at = new Date().toISOString();
    run.error_message = error instanceof Error ? error.message : String(error);
  }
  await run.save();

  await recordCrmSyncRunAudit(params.organizationId, params.projectId, run, params.triggeredByUserId);
  return run;
}

/**
 * Resolves the real `SinkPluginExecutor` for one of this codebase's two
 * built-in action plugins by `install.plugin_id` — the exact "Run now"-time
 * per-connector dispatch `runSourcePluginInstall` (KAN-49/52) already
 * established for the inbound direction, extended outbound as a second
 * connector (KAN-73 follow-up) joined the original CRM webhook one. Extracted
 * so a test can override `executor` directly instead of round-tripping
 * through the vault. Throws {@link UnsupportedSinkPluginError} for any other
 * `plugin_id` — a third-party manifest registered through the generic Plugin
 * Registry flow (KAN-46) with no real runtime built for it yet.
 */
async function defaultSinkExecutorForInstall(organizationId: string, projectId: string, install: PluginInstallModel, kms: KmsProvider): Promise<SinkPluginExecutor> {
  if (install.plugin_id === CRM_WEBHOOK_PLUGIN_ID) {
    const { webhookUrl, bearerToken } = await resolveCrmWebhookCredentialSecret(organizationId, projectId, install, kms);
    return new CrmWebhookSinkPluginExecutor({ apiClient: new CrmWebhookHttpApiClient(), webhookUrl, bearerToken });
  }
  if (install.plugin_id === META_CUSTOM_AUDIENCE_PLUGIN_ID) {
    const { accessToken, adAccountId, audienceName } = await resolveMetaAudienceCredentialSecret(organizationId, projectId, install, kms);
    return new MetaCustomAudienceSinkPluginExecutor({
      apiClient: new MetaAdsHttpApiClient({ accessToken }),
      adAccountId,
      audienceName,
      existingAudienceId: install.sink_external_ref ?? null,
    });
  }
  if (install.plugin_id === GOOGLE_CUSTOMER_MATCH_PLUGIN_ID) {
    const { developerToken, clientId, clientSecret, refreshToken, customerId, loginCustomerId, userListName } = await resolveGoogleCustomerMatchCredentialSecret(
      organizationId,
      projectId,
      install,
      kms,
    );
    return new GoogleCustomerMatchSinkPluginExecutor({
      apiClient: new GoogleAdsHttpApiClient({ developerToken, clientId, clientSecret, refreshToken, loginCustomerId }),
      customerId,
      userListName,
      existingUserListResourceName: install.sink_external_ref ?? null,
    });
  }
  throw new UnsupportedSinkPluginError(install.plugin_id);
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
