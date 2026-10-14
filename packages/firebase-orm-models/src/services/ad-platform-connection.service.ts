import { SharedCredentialModel } from '../models/shared-credential.model';
import { ProjectModel } from '../models/project.model';
import type { ResourceAttachmentModel } from '../models/resource-attachment.model';
import type { KmsProvider } from '../vault';
import {
  buildAdPlatformSecret,
  isAdPlatformProvider,
  verifyAdPlatformConnection,
  type AdPlatformProvider,
  type ConnectionCheck,
} from '../plugin-runtime/connections/verify';
import {
  createSharedCredential,
  listActiveAttachmentsForProject,
  listSharedCredentials,
  ProjectNotFoundError,
  pushResourceAttachment,
  setResourceAttachmentWriteTier,
} from './resource-library.service';
import { revealSharedCredentialSecret, setSharedCredentialSecret } from './vault.service';
import { recordAuditLogEntry } from './audit-log.service';

/**
 * Connecting an ad platform (Google Ads, Meta, TikTok) in one guided step: the details a person
 * typed are checked against the platform first, and only a connection that works is saved - in the
 * org's vault, as a shared credential named after the account it reached - and, when a project is
 * given, attached to it with the right to create ads. A later check re-runs the same call and keeps
 * its outcome on the credential, so every page can show whether a connection still works.
 */

/** The details are missing or malformed: `fields` names each one, for the form to point at. */
export class AdPlatformDetailsInvalidError extends Error {
  constructor(public readonly fields: string[]) {
    super(`Missing or malformed: ${fields.join(', ')}`);
    this.name = 'AdPlatformDetailsInvalidError';
  }
}

/** The credential is not an ad platform connection this check knows. */
export class NotAnAdPlatformCredentialError extends Error {
  constructor() {
    super('Only Google Ads, Meta and TikTok connections can be checked.');
    this.name = 'NotAnAdPlatformCredentialError';
  }
}

const PLATFORM_LABEL: Record<AdPlatformProvider, string> = { google_ads: 'Google Ads', meta_ads: 'Meta Ads', tiktok_ads: 'TikTok Ads' };

function applyCheck(credential: SharedCredentialModel, check: ConnectionCheck, now: Date): void {
  credential.last_checked_on = now.toISOString();
  credential.last_check_status = check.status === 'ok' ? 'ok' : check.reason;
  credential.last_check_account = check.account ?? credential.last_check_account ?? null;
}

async function audit(params: { organizationId: string; projectId?: string | null; actorId: string; action: string; credentialId: string; summary: string; after: Record<string, unknown> }): Promise<void> {
  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      ...(params.projectId ? { projectId: params.projectId } : {}),
      actorType: 'user',
      actorId: params.actorId,
      action: params.action,
      targetType: 'shared_credential',
      targetId: params.credentialId,
      summary: params.summary,
      after: params.after,
    });
  } catch {
    // Best-effort, like every other audit write.
  }
}

export async function connectAdPlatform(params: {
  organizationId: string;
  provider: AdPlatformProvider;
  /** What the person typed, by field name (see `AD_PLATFORM_FIELDS`). */
  fields: Record<string, unknown>;
  /** Attach the connection to this project, with the right to create ads. */
  projectId?: string | null;
  actorId: string;
  kms: KmsProvider;
  fetchImpl?: typeof fetch;
  now?: Date;
}): Promise<{ check: ConnectionCheck; credential: SharedCredentialModel | null; attachment: ResourceAttachmentModel | null; created: boolean }> {
  const now = params.now ?? new Date();
  const built = buildAdPlatformSecret(params.provider, params.fields);
  if ('invalid' in built) throw new AdPlatformDetailsInvalidError(built.invalid);
  if (params.projectId) {
    const project = await ProjectModel.init(params.projectId, { organization_id: params.organizationId });
    if (!project || project.organization_id !== params.organizationId) throw new ProjectNotFoundError();
  }
  const check = await verifyAdPlatformConnection(params.provider, built.secret, params.fetchImpl);
  // A connection that does not work is not saved: the person fixes the details and tries again.
  if (check.status !== 'ok') return { check, credential: null, attachment: null, created: false };

  const existing = (await listSharedCredentials(params.organizationId)).find(
    (credential) => credential.provider === params.provider && !credential.archived_at && (credential.available_scopes ?? []).includes(built.accountId),
  );
  const credential =
    existing ??
    (await createSharedCredential({
      organizationId: params.organizationId,
      name: `${PLATFORM_LABEL[params.provider]} - ${check.account.name ?? built.accountId} (${built.accountId})`.slice(0, 200),
      provider: params.provider,
      availableScopes: [built.accountId],
      createdByUserId: params.actorId,
    }));
  const sealed = await setSharedCredentialSecret({ organizationId: params.organizationId, credentialId: credential.id, secret: built.secret, kms: params.kms, actorId: params.actorId });
  sealed.connected_via = null;
  applyCheck(sealed, check, now);
  await sealed.save();

  let attachment: ResourceAttachmentModel | null = null;
  if (params.projectId) {
    const attached = (await listActiveAttachmentsForProject(params.organizationId, params.projectId)).find((entry) => entry.resource_kind === 'credential' && entry.resource_id === credential.id);
    attachment =
      attached ??
      (await pushResourceAttachment({ organizationId: params.organizationId, projectId: params.projectId, resourceKind: 'credential', resourceId: credential.id, pushedByUserId: params.actorId, scopeSelection: [built.accountId] }));
    if (attachment.write_tier !== 'manage') {
      attachment = await setResourceAttachmentWriteTier({ organizationId: params.organizationId, attachmentId: attachment.id, tier: 'manage', actorId: params.actorId });
    }
  }
  await audit({
    organizationId: params.organizationId,
    projectId: params.projectId,
    actorId: params.actorId,
    action: existing ? 'ad_platform.reconnected' : 'ad_platform.connected',
    credentialId: credential.id,
    summary: `${existing ? 'Reconnected' : 'Connected'} ${PLATFORM_LABEL[params.provider]} account ${built.accountId}`,
    after: { provider: params.provider, account_id: built.accountId, project_id: params.projectId ?? null },
  });
  return { check, credential: sealed, attachment, created: !existing };
}

/** Re-checks a saved ad platform connection and keeps the outcome on it. */
export async function checkAdPlatformConnection(params: {
  organizationId: string;
  credentialId: string;
  actorId: string;
  kms: KmsProvider;
  fetchImpl?: typeof fetch;
  now?: Date;
}): Promise<{ credential: SharedCredentialModel; check: ConnectionCheck }> {
  const now = params.now ?? new Date();
  const credential = await SharedCredentialModel.init(params.credentialId, { organization_id: params.organizationId });
  if (!credential || credential.organization_id !== params.organizationId) throw new NotAnAdPlatformCredentialError();
  if (!isAdPlatformProvider(credential.provider)) throw new NotAnAdPlatformCredentialError();
  let check: ConnectionCheck;
  if (!credential.encrypted_secret) {
    check = { status: 'failed', reason: 'invalid_details' };
  } else {
    const secret = await revealSharedCredentialSecret({ organizationId: params.organizationId, credentialId: credential.id, kms: params.kms });
    check = await verifyAdPlatformConnection(credential.provider, secret, params.fetchImpl);
  }
  applyCheck(credential, check, now);
  await credential.save();
  await audit({
    organizationId: params.organizationId,
    actorId: params.actorId,
    action: 'ad_platform.checked',
    credentialId: credential.id,
    summary: `Checked ${PLATFORM_LABEL[credential.provider]} connection: ${credential.last_check_status}`,
    after: { status: credential.last_check_status },
  });
  return { credential, check };
}
