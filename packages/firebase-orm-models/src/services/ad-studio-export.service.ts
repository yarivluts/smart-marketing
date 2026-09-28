import { AdStudioExportModel, type AdStudioExportDestination } from '../models/ad-studio-export.model';
import { SharedCredentialModel } from '../models/shared-credential.model';
import type { ResourceAttachmentModel } from '../models/resource-attachment.model';
import type { KmsProvider } from '../vault';
import { parseMetaAdsCredentialSecret } from '../plugin-runtime/meta-ads/credential-secret';
import { uploadMetaAdVideo, MetaVideoUploadError } from '../plugin-runtime/meta-ads/video-upload';
import { parseYouTubeCredentialSecret } from '../plugin-runtime/youtube/credential-secret';
import { uploadYouTubeVideo, YouTubeUploadError, YOUTUBE_PRIVACY_STATUSES, type YouTubePrivacyStatus } from '../plugin-runtime/youtube/upload-client';
import { MetaAdsApiError, MetaAdsHttpApiClient } from '../plugin-runtime/meta-ads/api-client';
import { parseGoogleAdsCredentialSecret } from '../plugin-runtime/google-ads/credential-secret';
import { GoogleAdsApiError, GoogleAdsHttpApiClient } from '../plugin-runtime/google-ads/api-client';
import { listActiveAttachmentsForProject } from './resource-library.service';
import { CredentialSecretNotSetError, revealSharedCredentialSecret } from './vault.service';
import { recordAuditLogEntry } from './audit-log.service';

/**
 * Exporting an Ad Studio video to an ad platform (KAN-232). A destination is available only through
 * an approved credential attachment on the project whose write tier allows changes (not `read`) and
 * whose credential has a secret set - the same gates the automation executors use for any change on
 * a platform. Secrets are decrypted in memory for the upload and never stored or logged.
 */

const PROVIDER_FOR: Record<AdStudioExportDestination, 'meta_ads' | 'youtube' | 'google_ads'> = { meta: 'meta_ads', youtube: 'youtube', google_ads: 'google_ads' };

/** Where each kind of creative can go: videos to Meta and YouTube, images to Meta and Google Ads. */
export const AD_STUDIO_VIDEO_EXPORT_DESTINATIONS = ['meta', 'youtube'] as const satisfies readonly AdStudioExportDestination[];
export const AD_STUDIO_IMAGE_EXPORT_DESTINATIONS = ['meta', 'google_ads'] as const satisfies readonly AdStudioExportDestination[];
export type AdStudioImageExportDestination = (typeof AD_STUDIO_IMAGE_EXPORT_DESTINATIONS)[number];

export type AdStudioExportUnavailableReason = 'not_attached' | 'read_only' | 'no_secret';

export type AdStudioExportDestinationStatus =
  | { available: true; attachmentId: string; credentialId: string; credentialName: string }
  | { available: false; reason: AdStudioExportUnavailableReason; credentialName?: string };

export type AdStudioExportDestinations = Record<AdStudioExportDestination, AdStudioExportDestinationStatus>;

async function destinationFor(
  organizationId: string,
  attachments: ResourceAttachmentModel[],
  destination: AdStudioExportDestination,
): Promise<AdStudioExportDestinationStatus> {
  let best: AdStudioExportDestinationStatus = { available: false, reason: 'not_attached' };
  for (const attachment of attachments) {
    if (attachment.resource_kind !== 'credential') continue;
    const credential = await SharedCredentialModel.init(attachment.resource_id, { organization_id: organizationId });
    if (!credential || credential.provider !== PROVIDER_FOR[destination] || credential.archived_at) continue;
    if (attachment.write_tier === 'read') {
      best = { available: false, reason: 'read_only', credentialName: credential.name };
      continue;
    }
    if (!credential.encrypted_secret) {
      best = { available: false, reason: 'no_secret', credentialName: credential.name };
      continue;
    }
    return { available: true, attachmentId: attachment.id, credentialId: credential.id, credentialName: credential.name };
  }
  return best;
}

/** Where this project can export a video, and why not where it cannot. */
export async function resolveAdStudioExportDestinations(organizationId: string, projectId: string): Promise<AdStudioExportDestinations> {
  const attachments = await listActiveAttachmentsForProject(organizationId, projectId);
  const [meta, youtube, googleAds] = await Promise.all([
    destinationFor(organizationId, attachments, 'meta'),
    destinationFor(organizationId, attachments, 'youtube'),
    destinationFor(organizationId, attachments, 'google_ads'),
  ]);
  return { meta, youtube, google_ads: googleAds };
}

export class AdStudioExportUnavailableError extends Error {
  constructor(
    public readonly destination: AdStudioExportDestination,
    public readonly reason: AdStudioExportUnavailableReason,
  ) {
    super(`Exporting to ${destination} is not available for this project (${reason}).`);
    this.name = 'AdStudioExportUnavailableError';
  }
}

export class AdStudioExportInvalidError extends Error {
  constructor(public readonly reasons: string[]) {
    super(`The export request is not valid: ${reasons.join('; ')}`);
    this.name = 'AdStudioExportInvalidError';
  }
}

type Uploaders = {
  meta: typeof uploadMetaAdVideo;
  youtube: typeof uploadYouTubeVideo;
};

export interface ExportAdStudioVideoParams {
  organizationId: string;
  projectId: string;
  briefId: string;
  videoId: string;
  destination: AdStudioExportDestination;
  title: string;
  description: string;
  /** YouTube only; defaults to `unlisted` so nothing becomes public by accident. */
  privacy?: YouTubePrivacyStatus;
  /** Reads the assembled video's bytes (from the studio's storage). */
  readVideo: () => Promise<Uint8Array>;
  kms: KmsProvider;
  actorId: string;
  actorType?: 'user' | 'api_key';
  uploaders?: Partial<Uploaders>;
  now?: () => Date;
}

/**
 * Uploads the video and records the outcome. The export row is written as `uploading` first and
 * finished as `done` (with the platform id and link) or `failed` (with a stable code); either way
 * an audit entry names what was sent where.
 */
export async function exportAdStudioVideo(params: ExportAdStudioVideoParams): Promise<AdStudioExportModel> {
  const now = params.now ?? (() => new Date());
  const title = params.title.trim();
  const description = params.description.trim();
  const privacy = params.privacy ?? 'unlisted';
  const reasons: string[] = [];
  if (title.length === 0 || title.length > 100) reasons.push('title must be 1-100 characters');
  if (description.length > 5000) reasons.push('description must be at most 5000 characters');
  if (params.destination === 'youtube' && !(YOUTUBE_PRIVACY_STATUSES as readonly string[]).includes(privacy)) reasons.push('privacy must be private, unlisted or public');
  if (reasons.length) throw new AdStudioExportInvalidError(reasons);

  if (!(AD_STUDIO_VIDEO_EXPORT_DESTINATIONS as readonly string[]).includes(params.destination)) throw new AdStudioExportInvalidError(['videos export to meta or youtube']);
  const destinations = await resolveAdStudioExportDestinations(params.organizationId, params.projectId);
  const target = destinations[params.destination];
  if (!target.available) throw new AdStudioExportUnavailableError(params.destination, target.reason);

  const row = new AdStudioExportModel();
  row.organization_id = params.organizationId;
  row.project_id = params.projectId;
  row.brief_id = params.briefId;
  row.media_kind = 'video';
  row.video_id = params.videoId;
  row.image_id = null;
  row.destination = params.destination;
  row.attachment_id = target.attachmentId;
  row.title = title;
  row.description = description;
  row.privacy = params.destination === 'youtube' ? privacy : null;
  row.status = 'uploading';
  row.requested_by = params.actorId;
  row.requested_on = now().toISOString();
  row.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
  await row.save();

  const uploaders: Uploaders = { meta: uploadMetaAdVideo, youtube: uploadYouTubeVideo, ...params.uploaders };
  try {
    const raw = await revealSharedCredentialSecret({ organizationId: params.organizationId, credentialId: target.credentialId, kms: params.kms });
    const bytes = await params.readVideo();
    const result =
      params.destination === 'meta'
        ? await (async () => {
            const secret = parseMetaAdsCredentialSecret(raw);
            return uploaders.meta({ accessToken: secret.accessToken, adAccountId: secret.adAccountId, title, description, bytes });
          })()
        : await uploaders.youtube(parseYouTubeCredentialSecret(raw), { title, description, privacyStatus: privacy, bytes });
    row.status = 'done';
    row.external_id = result.videoId;
    row.external_url = result.url;
  } catch (error) {
    row.status = 'failed';
    row.failure_code =
      error instanceof MetaVideoUploadError || error instanceof YouTubeUploadError ? error.code : error instanceof CredentialSecretNotSetError ? 'no_secret' : 'invalid_credential';
    row.failure_message = error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
  }
  row.completed_on = now().toISOString();
  await row.save();

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      actorType: params.actorType ?? 'user',
      actorId: params.actorId,
      action: row.status === 'done' ? 'ad_studio.video_exported' : 'ad_studio.video_export_failed',
      targetType: 'ad_studio_export',
      targetId: row.id,
      summary:
        row.status === 'done'
          ? `Exported Ad Studio video "${title}" to ${params.destination === 'meta' ? 'Meta' : 'YouTube'}`
          : `Export of Ad Studio video "${title}" to ${params.destination === 'meta' ? 'Meta' : 'YouTube'} failed (${row.failure_code})`,
      after: { destination: params.destination, status: row.status, external_id: row.external_id ?? null },
    });
  } catch {
    // Best-effort.
  }
  return row;
}

export type AdStudioImageUploader = (params: { secretJson: string; name: string; bytes: Uint8Array }) => Promise<{ externalId: string; url: string | null }>;

function platformFailureCode(status: number): string {
  if (status === 401 || status === 403) return 'auth_failed';
  if (status === 429) return 'quota_exceeded';
  if (status >= 400 && status < 500) return 'rejected';
  return 'upload_failed';
}

/** Meta: the image goes into the ad account's image library; its hash is what an ad creative references. */
const uploadMetaAdImage: AdStudioImageUploader = async ({ secretJson, bytes }) => {
  const secret = parseMetaAdsCredentialSecret(secretJson);
  const client = new MetaAdsHttpApiClient({ accessToken: secret.accessToken });
  const { imageHash } = await client.uploadAdImage(secret.adAccountId, { base64Bytes: Buffer.from(bytes).toString('base64') });
  return { externalId: imageHash, url: null };
};

/** Google Ads: the image becomes an image asset in the account's asset library. */
const uploadGoogleAdsImageAsset: AdStudioImageUploader = async ({ secretJson, name, bytes }) => {
  const secret = parseGoogleAdsCredentialSecret(secretJson);
  const client = new GoogleAdsHttpApiClient({
    developerToken: secret.developerToken,
    clientId: secret.clientId,
    clientSecret: secret.clientSecret,
    refreshToken: secret.refreshToken,
    loginCustomerId: secret.loginCustomerId,
  });
  const { assetResourceName } = await client.uploadImageAsset(secret.customerId, { name, base64Data: Buffer.from(bytes).toString('base64') });
  return { externalId: assetResourceName, url: null };
};

export interface ExportAdStudioImageParams {
  organizationId: string;
  projectId: string;
  briefId: string;
  imageId: string;
  destination: AdStudioImageExportDestination;
  /** The asset's name on the platform. */
  title: string;
  readImage: () => Promise<Uint8Array>;
  kms: KmsProvider;
  actorId: string;
  actorType?: 'user' | 'api_key';
  uploaders?: Partial<Record<AdStudioImageExportDestination, AdStudioImageUploader>>;
  now?: () => Date;
}

/**
 * Uploads an Ad Studio image to Meta's ad image library or Google Ads' asset library and records the
 * outcome, with the same gates, row lifecycle and audit as a video export.
 */
export async function exportAdStudioImage(params: ExportAdStudioImageParams): Promise<AdStudioExportModel> {
  const now = params.now ?? (() => new Date());
  const title = params.title.trim();
  const reasons: string[] = [];
  if (title.length === 0 || title.length > 100) reasons.push('title must be 1-100 characters');
  if (!(AD_STUDIO_IMAGE_EXPORT_DESTINATIONS as readonly string[]).includes(params.destination)) reasons.push('images export to meta or google_ads');
  if (reasons.length) throw new AdStudioExportInvalidError(reasons);

  const destinations = await resolveAdStudioExportDestinations(params.organizationId, params.projectId);
  const target = destinations[params.destination];
  if (!target.available) throw new AdStudioExportUnavailableError(params.destination, target.reason);

  const row = new AdStudioExportModel();
  row.organization_id = params.organizationId;
  row.project_id = params.projectId;
  row.brief_id = params.briefId;
  row.media_kind = 'image';
  row.video_id = null;
  row.image_id = params.imageId;
  row.destination = params.destination;
  row.attachment_id = target.attachmentId;
  row.title = title;
  row.description = '';
  row.privacy = null;
  row.status = 'uploading';
  row.requested_by = params.actorId;
  row.requested_on = now().toISOString();
  row.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
  await row.save();

  const uploaders: Record<AdStudioImageExportDestination, AdStudioImageUploader> = { meta: uploadMetaAdImage, google_ads: uploadGoogleAdsImageAsset, ...params.uploaders };
  try {
    const secretJson = await revealSharedCredentialSecret({ organizationId: params.organizationId, credentialId: target.credentialId, kms: params.kms });
    const bytes = await params.readImage();
    const result = await uploaders[params.destination]({ secretJson, name: title, bytes });
    row.status = 'done';
    row.external_id = result.externalId;
    row.external_url = result.url;
  } catch (error) {
    row.status = 'failed';
    row.failure_code =
      error instanceof MetaAdsApiError || error instanceof GoogleAdsApiError
        ? platformFailureCode(error.status)
        : error instanceof CredentialSecretNotSetError
          ? 'no_secret'
          : 'upload_failed';
    row.failure_message = error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
  }
  row.completed_on = now().toISOString();
  await row.save();

  const platform = params.destination === 'meta' ? 'Meta' : 'Google Ads';
  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      actorType: params.actorType ?? 'user',
      actorId: params.actorId,
      action: row.status === 'done' ? 'ad_studio.image_exported' : 'ad_studio.image_export_failed',
      targetType: 'ad_studio_export',
      targetId: row.id,
      summary: row.status === 'done' ? `Exported Ad Studio image "${title}" to ${platform}` : `Export of Ad Studio image "${title}" to ${platform} failed (${row.failure_code})`,
      after: { destination: params.destination, status: row.status, external_id: row.external_id ?? null, image_id: params.imageId },
    });
  } catch {
    // Best-effort.
  }
  return row;
}

export async function listAdStudioExports(organizationId: string, projectId: string, briefId: string): Promise<AdStudioExportModel[]> {
  const rows = await AdStudioExportModel.initPath({ organization_id: organizationId, project_id: projectId }).where('brief_id', '==', briefId).get();
  return rows.sort((a, b) => b.requested_on.localeCompare(a.requested_on));
}
