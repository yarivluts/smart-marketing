import { AdStudioExportModel } from '../models/ad-studio-export.model';
import type { KmsProvider } from '../vault';
import { parseMetaAdsCredentialSecret, type MetaAdsCredentialSecret } from '../plugin-runtime/meta-ads/credential-secret';
import { MetaAdsApiError, MetaAdsHttpApiClient, type MetaAdsApiClient } from '../plugin-runtime/meta-ads/api-client';
import { MetaVideoUploadError, uploadMetaAdVideo } from '../plugin-runtime/meta-ads/video-upload';
import { parseGoogleAdsCredentialSecret, type GoogleAdsCredentialSecret } from '../plugin-runtime/google-ads/credential-secret';
import { GoogleAdsApiError, GoogleAdsHttpApiClient, type GoogleAdsApiClient } from '../plugin-runtime/google-ads/api-client';
import { AdStudioExportInvalidError, AdStudioExportUnavailableError, resolveAdStudioExportDestinations } from './ad-studio-export.service';
import { CredentialSecretNotSetError, revealSharedCredentialSecret } from './vault.service';
import { recordAuditLogEntry } from './audit-log.service';
import { searchAdIssues, searchTargetingToGoogle, type AdStudioSearchAd, type AdStudioSearchKeyword, type AdStudioSearchTargeting } from '@growthos/shared';

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
 *   A search ad becomes a Search campaign (Google Search only) in the country and language its
 *   keywords were researched in, with the responsive search ad, the keywords and the negatives.
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
  | { kind: 'video'; videoId: string; video: Uint8Array; thumbnail: Uint8Array }
  | { kind: 'search'; ad: AdStudioSearchAd; keywords: AdStudioSearchKeyword[]; negatives: string[]; targeting: AdStudioSearchTargeting };

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

/** The JSON error object a platform answered with, when the error message quotes one. */
function platformError(error: unknown): Record<string, unknown> | null {
  if (!(error instanceof MetaAdsApiError || error instanceof GoogleAdsApiError)) return null;
  const start = error.message.indexOf('{');
  if (start < 0) return null;
  try {
    const parsed = JSON.parse(error.message.slice(start)) as { error?: Record<string, unknown> };
    return parsed.error && typeof parsed.error === 'object' ? parsed.error : null;
  } catch {
    return null;
  }
}

/** What the platform told the person, in its own words: Meta's title and user message, else its message. */
function failureDetail(error: unknown): string | null {
  const platform = platformError(error);
  if (!platform) return null;
  const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
  const user = [text(platform.error_user_title), text(platform.error_user_msg)].filter(Boolean).join(' - ');
  return (user || text(platform.message)).slice(0, 500) || null;
}

function failureCode(error: unknown): string {
  // Meta locked the account behind a security check (code 31): nothing works until the person verifies it in Ads Manager.
  if (error instanceof MetaAdsApiError && platformError(error)?.code === 31) return 'account_action_required';
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
  if (params.media.kind === 'search') {
    if (params.destination !== 'google_ads') reasons.push('a search ad runs on Google Ads');
    if (params.media.keywords.length === 0) reasons.push('choose at least one keyword');
    if (searchAdIssues(params.media.ad).length) reasons.push('the search ad breaks Google limits - fix it in the Review step');
  } else {
    if (!copy.headline.trim()) reasons.push('headline is required');
    if (!copy.primaryText.trim()) reasons.push('primary text is required');
  }
  if (!/^https?:\/\/\S+$/i.test(copy.linkUrl.trim())) reasons.push('link must be an http(s) URL');
  if (!Number.isFinite(params.dailyBudget) || params.dailyBudget <= 0) reasons.push('daily budget must be a positive number');
  if (params.destination === 'meta' && params.countries.length === 0) reasons.push('choose at least one country');
  if (params.destination === 'google_ads' && params.media.kind === 'search') {
    if (typeof params.containsEuPoliticalAdvertising !== 'boolean') reasons.push('answer whether the campaign contains EU political advertising');
  } else if (params.destination === 'google_ads') {
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
  try {
    return await buildMetaAd(params, secret, client, campaignId);
  } catch (error) {
    // Nothing half-built is left behind: deleting the campaign takes its ad set with it. Best-effort; the real error is reported.
    await client.setObjectStatus(campaignId, 'DELETED').catch(() => undefined);
    throw error;
  }
}

async function buildMetaAd(
  params: PublishAdStudioAdParams,
  secret: MetaAdsCredentialSecret,
  client: MetaAdsApiClient,
  campaignId: string,
): Promise<{ refs: Record<string, string>; url: string; externalId: string }> {
  const account = secret.adAccountId;
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
  } else if (params.media.kind === 'video') {
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
  } else {
    // Never reached: a search ad is refused for Meta before anything is created.
    throw new AdStudioExportInvalidError(['a search ad runs on Google Ads']);
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

/**
 * The ad group's max CPC: the middle of what the chosen keywords' top-of-page bids reach (Google's
 * own numbers), else a twentieth of the daily budget (at least 0.5) - never above the budget.
 */
export function searchCpcBid(keywords: readonly Pick<AdStudioSearchKeyword, 'highTopOfPageBid'>[], dailyBudget: number): number {
  const bids = keywords.map((keyword) => keyword.highTopOfPageBid).filter((bid): bid is number => typeof bid === 'number' && bid > 0).sort((a, b) => a - b);
  const median = bids.length ? (bids.length % 2 ? bids[(bids.length - 1) / 2] : (bids[bids.length / 2 - 1] + bids[bids.length / 2]) / 2) : Math.max(0.5, dailyBudget / 20);
  return Math.min(median, dailyBudget);
}

async function publishSearchToGoogle(
  params: PublishAdStudioAdParams,
  media: Extract<AdStudioPublishMedia, { kind: 'search' }>,
  client: GoogleAdsApiClient,
  customer: string,
): Promise<{ refs: Record<string, string>; url: string; externalId: string }> {
  const google = searchTargetingToGoogle(media.targeting);
  const created = await client.createSearchAdCampaign(customer, {
    name: params.campaignName.trim(),
    dailyBudgetMicros: params.dailyBudget * 1_000_000,
    cpcBidMicros: searchCpcBid(media.keywords, params.dailyBudget) * 1_000_000,
    containsEuPoliticalAdvertising: params.containsEuPoliticalAdvertising === true,
    headlines: media.ad.headlines,
    descriptions: media.ad.descriptions,
    path1: media.ad.path1,
    path2: media.ad.path2,
    finalUrl: params.copy.linkUrl.trim(),
    keywords: media.keywords.map((keyword) => ({ text: keyword.text, matchType: keyword.matchType })),
    negativeKeywords: media.negatives,
    geoTargetConstants: google.geoTargetConstants,
    languageConstants: google.language ? [google.language] : [],
  });
  const campaignId = created.campaignResourceName.split('/').pop() as string;
  return {
    refs: { customer_id: customer, campaign: created.campaignResourceName, ad_group: created.adGroupResourceName, ad: created.adResourceName },
    externalId: created.adResourceName,
    url: `https://ads.google.com/aw/ads?campaignId=${campaignId}&__e=${customer}`,
  };
}

/**
 * The Google Ads client and customer id for a credential. Google's own UI shows account ids with
 * dashes (123-456-7890) and people paste them that way; the API takes the digits only.
 */
function googleClientFor(params: PublishAdStudioAdParams, secretJson: string): { client: GoogleAdsApiClient; customer: string } {
  const secret = parseGoogleAdsCredentialSecret(secretJson);
  const loginCustomerId = secret.loginCustomerId?.replace(/-/g, '');
  const client =
    params.clients?.google?.(secret) ??
    new GoogleAdsHttpApiClient({ developerToken: secret.developerToken, clientId: secret.clientId, clientSecret: secret.clientSecret, refreshToken: secret.refreshToken, loginCustomerId });
  return { client, customer: secret.customerId.replace(/-/g, '') };
}

async function publishToGoogle(params: PublishAdStudioAdParams, secretJson: string): Promise<{ refs: Record<string, string>; url: string; externalId: string }> {
  if (params.media.kind === 'search') {
    const { client, customer } = googleClientFor(params, secretJson);
    return publishSearchToGoogle(params, params.media, client, customer);
  }
  if (params.media.kind !== 'image' || !params.media.square || !params.media.landscape) throw new AdStudioExportInvalidError(['Google needs a square and a 1.91:1 image']);
  const { client, customer } = googleClientFor(params, secretJson);
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
  row.description = params.media.kind === 'search' ? (params.media.ad.headlines[0] ?? '') : params.copy.primaryText.trim();
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
    // Only defined values: Firestore refuses undefined, and a crash here would leave the row stuck as uploading.
    row.platform_refs = Object.fromEntries(Object.entries(result.refs).filter(([, value]) => typeof value === 'string' && value.length > 0));
  } catch (error) {
    row.status = 'failed';
    row.failure_code = failureCode(error);
    row.failure_message = error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
    row.failure_detail = failureDetail(error);
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
      summary: row.status === 'done' ? `Created a paused ${params.media.kind === 'search' ? 'search' : params.media.kind} ad "${row.title}" on ${platform}` : `Creating a ${params.media.kind} ad "${row.title}" on ${platform} failed (${row.failure_code})`,
      after: { destination: params.destination, status: row.status, platform_refs: row.platform_refs ?? null },
    });
  } catch {
    // Best-effort.
  }
  return row;
}
