import { AdStudioExportModel } from '../models/ad-studio-export.model';
import type { KmsProvider } from '../vault';
import { parseMetaAdsCredentialSecret } from '../plugin-runtime/meta-ads/credential-secret';
import { MetaAdsApiError, MetaAdsHttpApiClient, type MetaAdsApiClient } from '../plugin-runtime/meta-ads/api-client';
import { MetaVideoUploadError, uploadMetaAdVideo } from '../plugin-runtime/meta-ads/video-upload';
import { parseGoogleAdsCredentialSecret, type GoogleAdsCredentialSecret } from '../plugin-runtime/google-ads/credential-secret';
import { GoogleAdsApiError, GoogleAdsHttpApiClient, type GoogleAdsApiClient } from '../plugin-runtime/google-ads/api-client';
import { AdStudioExportInvalidError, AdStudioExportUnavailableError, resolveAdStudioExportDestinations } from './ad-studio-export.service';
import { CredentialSecretNotSetError, revealSharedCredentialSecret } from './vault.service';
import { recordAuditLogEntry } from './audit-log.service';

/**
 * Publishing an Ad Studio creative as a real ad (the stepper's last step): not just uploading media
 * to a library, but creating the campaign, ad set / ad group, creative and ad on the platform - all
 * PAUSED, so a person reviews it in the platform before anything spends. The result is recorded like
 * an export (`result_kind: 'ad'`) with the platform's ids and a link to the ad.
 *
 * - Meta (Facebook/Instagram): a traffic campaign with a campaign-level daily budget, an ad set
 *   targeting the chosen countries, and a link ad (image) or video ad with a Learn More button.
 * - Google Ads: a Display campaign with a responsive display ad built from a 1.91:1 and a 1:1 image
 *   (Google's required ratios). Google video ads run from YouTube, so a video is not published here.
 *
 * Same gates as exports: an approved, writable attachment with a saved secret, and (at the route)
 * `automation.execute`.
 */

export type AdStudioPublishDestination = 'meta' | 'google_ads';

export interface AdStudioAdCopy {
  /** Short headline: at most 30 characters for Google, 40 recommended for Meta. */
  headline: string;
  /** Longer body text / Google long headline source, at most 90 characters for Google. */
  primaryText: string;
  description: string;
  linkUrl: string;
  /** Advertiser / brand name (Google requires it). */
  businessName: string;
}

export type AdStudioPublishMedia =
  | { kind: 'image'; imageId: string; square: Uint8Array | null; landscape: Uint8Array | null; primary: Uint8Array }
  | { kind: 'video'; videoId: string; video: Uint8Array; thumbnail: Uint8Array };

export interface PublishAdStudioAdParams {
  organizationId: string;
  projectId: string;
  briefId: string;
  destination: AdStudioPublishDestination;
  media: AdStudioPublishMedia;
  copy: AdStudioAdCopy;
  campaignName: string;
  /** Daily budget in the ad account's own currency (major units). The ad is created paused either way. */
  dailyBudget: number;
  /** ISO country codes the Meta ad set targets. */
  countries: string[];
  /** Google only: the advertiser's EU political advertising self-declaration - never defaulted. */
  containsEuPoliticalAdvertising?: boolean;
  kms: KmsProvider;
  actorId: string;
  actorType?: 'user' | 'api_key';
  clients?: {
    meta?: (accessToken: string) => MetaAdsApiClient;
    google?: (secret: GoogleAdsCredentialSecret) => GoogleAdsApiClient;
    uploadVideo?: typeof uploadMetaAdVideo;
  };
  now?: () => Date;
}

function failureCode(error: unknown): string {
  if (error instanceof MetaAdsApiError || error instanceof GoogleAdsApiError) {
    if (error.status === 401 || error.status === 403) return 'auth_failed';
    if (error.status === 429) return 'quota_exceeded';
    if (error.status >= 400 && error.status < 500) return 'rejected';
    return 'upload_failed';
  }
  if (error instanceof MetaVideoUploadError) return error.code;
  if (error instanceof CredentialSecretNotSetError) return 'no_secret';
  return 'upload_failed';
}

function validate(params: PublishAdStudioAdParams): string[] {
  const reasons: string[] = [];
  const { copy } = params;
  if (!params.campaignName.trim() || params.campaignName.trim().length > 120) reasons.push('campaign name must be 1-120 characters');
  if (!copy.headline.trim()) reasons.push('headline is required');
  if (!copy.primaryText.trim()) reasons.push('primary text is required');
  if (!/^https?:\/\/\S+$/i.test(copy.linkUrl.trim())) reasons.push('link must be an http(s) URL');
  if (!Number.isFinite(params.dailyBudget) || params.dailyBudget <= 0) reasons.push('daily budget must be a positive number');
  if (params.destination === 'meta' && params.countries.length === 0) reasons.push('choose at least one country');
  if (params.destination === 'google_ads') {
    if (params.media.kind !== 'image') reasons.push('Google Ads video ads run from YouTube; publish an image ad to Google Ads');
    if (typeof params.containsEuPoliticalAdvertising !== 'boolean') reasons.push('answer whether the campaign contains EU political advertising');
    if (copy.headline.trim().length > 30) reasons.push('Google headline must be at most 30 characters');
    if (copy.primaryText.trim().length > 90 || copy.description.trim().length > 90) reasons.push('Google long headline and description must be at most 90 characters');
    if (!copy.businessName.trim() || copy.businessName.trim().length > 25) reasons.push('business name must be 1-25 characters');
    if (params.media.kind === 'image' && (!params.media.square || !params.media.landscape)) reasons.push('Google needs a square and a 1.91:1 image');
  }
  return reasons;
}

function b64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

async function publishToMeta(params: PublishAdStudioAdParams, secretJson: string): Promise<{ refs: Record<string, string>; url: string; externalId: string }> {
  const secret = parseMetaAdsCredentialSecret(secretJson);
  const client = params.clients?.meta?.(secret.accessToken) ?? new MetaAdsHttpApiClient({ accessToken: secret.accessToken });
  const account = secret.adAccountId;
  const { campaignId } = await client.createCampaign(account, { name: params.campaignName.trim(), objective: 'OUTCOME_TRAFFIC', dailyBudgetCents: Math.round(params.dailyBudget * 100) });
  const { adSetId } = await client.createAdSet(account, { campaignId, name: `${params.campaignName.trim()} - ad set`, targeting: { countries: params.countries, ageMin: 18, ageMax: 65 } });
  let creativeId: string;
  const refs: Record<string, string> = { campaign_id: campaignId, ad_set_id: adSetId };
  if (params.media.kind === 'image') {
    const { imageHash } = await client.uploadAdImage(account, { base64Bytes: b64(params.media.primary) });
    refs.image_hash = imageHash;
    ({ creativeId } = await client.createAdCreative(account, {
      pageId: secret.pageId,
      primaryText: params.copy.primaryText.trim(),
      headline: params.copy.headline.trim(),
      ...(params.copy.description.trim() ? { description: params.copy.description.trim() } : {}),
      linkUrl: params.copy.linkUrl.trim(),
      imageHash,
    }));
  } else {
    const upload = params.clients?.uploadVideo ?? uploadMetaAdVideo;
    const video = await upload({ accessToken: secret.accessToken, adAccountId: account, title: params.copy.headline.trim(), description: params.copy.primaryText.trim(), bytes: params.media.video });
    const { imageHash } = await client.uploadAdImage(account, { base64Bytes: b64(params.media.thumbnail) });
    refs.video_id = video.videoId;
    refs.thumbnail_hash = imageHash;
    ({ creativeId } = await client.createVideoAdCreative(account, {
      pageId: secret.pageId,
      videoId: video.videoId,
      imageHash,
      primaryText: params.copy.primaryText.trim(),
      headline: params.copy.headline.trim(),
      ...(params.copy.description.trim() ? { description: params.copy.description.trim() } : {}),
      linkUrl: params.copy.linkUrl.trim(),
    }));
  }
  refs.creative_id = creativeId;
  const { adId } = await client.createAd(account, { name: params.campaignName.trim(), adSetId, creativeId });
  refs.ad_id = adId;
  refs.ad_account_id = account;
  return {
    refs,
    externalId: adId,
    url: `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${account}&selected_campaign_ids=${campaignId}&selected_ad_ids=${adId}`,
  };
}

async function publishToGoogle(params: PublishAdStudioAdParams, secretJson: string): Promise<{ refs: Record<string, string>; url: string; externalId: string }> {
  if (params.media.kind !== 'image' || !params.media.square || !params.media.landscape) throw new AdStudioExportInvalidError(['Google needs a square and a 1.91:1 image']);
  const secret = parseGoogleAdsCredentialSecret(secretJson);
  const client =
    params.clients?.google?.(secret) ??
    new GoogleAdsHttpApiClient({
      developerToken: secret.developerToken,
      clientId: secret.clientId,
      clientSecret: secret.clientSecret,
      refreshToken: secret.refreshToken,
      loginCustomerId: secret.loginCustomerId,
    });
  const customer = secret.customerId;
  const name = params.campaignName.trim();
  const landscape = await client.uploadImageAsset(customer, { name: `${name} - landscape`, base64Data: b64(params.media.landscape) });
  const square = await client.uploadImageAsset(customer, { name: `${name} - square`, base64Data: b64(params.media.square) });
  const created = await client.createDisplayAdCampaign(customer, {
    name,
    dailyBudgetMicros: params.dailyBudget * 1_000_000,
    cpcBidMicros: Math.max(0.5, params.dailyBudget / 20) * 1_000_000,
    containsEuPoliticalAdvertising: params.containsEuPoliticalAdvertising === true,
    marketingImageAssets: [landscape.assetResourceName],
    squareImageAssets: [square.assetResourceName],
    headlines: [params.copy.headline.trim()],
    longHeadline: params.copy.primaryText.trim(),
    descriptions: [params.copy.description.trim() || params.copy.primaryText.trim()],
    businessName: params.copy.businessName.trim(),
    finalUrl: params.copy.linkUrl.trim(),
  });
  const campaignId = created.campaignResourceName.split('/').pop() as string;
  const adId = created.adResourceName.split('~').pop() as string;
  return {
    refs: {
      customer_id: customer,
      campaign: created.campaignResourceName,
      ad_group: created.adGroupResourceName,
      ad: created.adResourceName,
      landscape_asset: landscape.assetResourceName,
      square_asset: square.assetResourceName,
    },
    externalId: created.adResourceName,
    url: `https://ads.google.com/aw/ads?campaignId=${campaignId}&adId=${adId}&__e=${customer}`,
  };
}

/** Creates the paused ad on the platform and records it (done with the link, or failed with a code), audited either way. */
export async function publishAdStudioAd(params: PublishAdStudioAdParams): Promise<AdStudioExportModel> {
  const now = params.now ?? (() => new Date());
  const reasons = validate(params);
  if (reasons.length) throw new AdStudioExportInvalidError(reasons);
  const destinations = await resolveAdStudioExportDestinations(params.organizationId, params.projectId);
  const target = destinations[params.destination];
  if (!target.available) throw new AdStudioExportUnavailableError(params.destination, target.reason);

  const row = new AdStudioExportModel();
  row.organization_id = params.organizationId;
  row.project_id = params.projectId;
  row.brief_id = params.briefId;
  row.media_kind = params.media.kind;
  row.video_id = params.media.kind === 'video' ? params.media.videoId : null;
  row.image_id = params.media.kind === 'image' ? params.media.imageId : null;
  row.result_kind = 'ad';
  row.destination = params.destination;
  row.attachment_id = target.attachmentId;
  row.title = params.campaignName.trim();
  row.description = params.copy.primaryText.trim();
  row.privacy = null;
  row.status = 'uploading';
  row.requested_by = params.actorId;
  row.requested_on = now().toISOString();
  row.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
  await row.save();

  try {
    const secretJson = await revealSharedCredentialSecret({ organizationId: params.organizationId, credentialId: target.credentialId, kms: params.kms });
    const result = params.destination === 'meta' ? await publishToMeta(params, secretJson) : await publishToGoogle(params, secretJson);
    row.status = 'done';
    row.external_id = result.externalId;
    row.external_url = result.url;
    row.platform_refs = result.refs;
  } catch (error) {
    row.status = 'failed';
    row.failure_code = failureCode(error);
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
      action: row.status === 'done' ? 'ad_studio.ad_published' : 'ad_studio.ad_publish_failed',
      targetType: 'ad_studio_export',
      targetId: row.id,
      summary: row.status === 'done' ? `Created a paused ${params.media.kind} ad "${row.title}" on ${platform}` : `Creating a ${params.media.kind} ad "${row.title}" on ${platform} failed (${row.failure_code})`,
      after: { destination: params.destination, status: row.status, platform_refs: row.platform_refs ?? null },
    });
  } catch {
    // Best-effort.
  }
  return row;
}
