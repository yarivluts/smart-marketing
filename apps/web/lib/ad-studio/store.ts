import 'server-only';
import type { AdStudioAdCopy, AdStudioVoice, AdStudioVideoSettings, AdStudioSearchAd, AdStudioSearchKeywords, AdStudioBriefInput, AdStudioImageConcept, AdStudioPlan, AdStudioPlanSources, AdStudioScene } from '@growthos/shared';
import {
  createAdStudioBrief as createAdStudioBriefInOrganization,
  deleteAdStudioBrief as deleteAdStudioBriefInOrganization,
  getAdStudioBrief as getAdStudioBriefInOrganization,
  getAdStudioClip as getAdStudioClipInOrganization,
  getAdStudioVideo as getAdStudioVideoInOrganization,
  getLatestAdStudioRun as getLatestAdStudioRunInOrganization,
  listAdStudioClips as listAdStudioClipsInOrganization,
  listAdStudioExports as listAdStudioExportsInOrganization,
  resolveAdStudioExportDestinations as resolveAdStudioExportDestinationsInOrganization,
  listAdStudioVideos as listAdStudioVideosInOrganization,
  getAdStudioKeywordAccess as getAdStudioKeywordAccessInOrganization,
  getAdStudioSettings as getAdStudioSettingsInOrganization,
  getAdStudioUsageToday as getAdStudioUsageTodayInOrganization,
  listAdStudioBriefs as listAdStudioBriefsInOrganization,
  listAdStudioUsage as listAdStudioUsageInOrganization,
  setAdStudioSettings as setAdStudioSettingsInOrganization,
  updateAdStudioBriefDetails as updateAdStudioBriefDetailsInOrganization,
  type AdStudioBriefModel,
  type AdStudioClipModel,
  type AdStudioVideoModel,
  type AdStudioSettingsView,
  type AdStudioUsageModel,
  type AdStudioUsageToday,
  type AdStudioExportDestinations,
  type AdStudioExportModel,
} from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { getServerKmsProvider, VaultNotConfiguredError } from '@/lib/vault/kms-provider';
import { adStudioBriefMediaPrefix, resolveAdStudioMediaStorage, toAdStudioRunView, type AdStudioRunView } from './engine';

/** The web app's Ad Studio reads and writes: the package services, with the ORM connected first. */

export async function listAdStudioBriefs(organizationId: string, projectId: string): Promise<AdStudioBriefModel[]> {
  await ensureFirestoreOrm();
  return listAdStudioBriefsInOrganization(organizationId, projectId);
}

export async function getAdStudioBrief(organizationId: string, projectId: string, briefId: string): Promise<AdStudioBriefModel> {
  await ensureFirestoreOrm();
  return getAdStudioBriefInOrganization(organizationId, projectId, briefId);
}

export async function createAdStudioBrief(params: { organizationId: string; projectId: string; input: AdStudioBriefInput; createdByUserId: string }): Promise<AdStudioBriefModel> {
  await ensureFirestoreOrm();
  return createAdStudioBriefInOrganization(params);
}

export async function updateAdStudioBriefDetails(params: { organizationId: string; projectId: string; briefId: string; input: AdStudioBriefInput }): Promise<AdStudioBriefModel> {
  await ensureFirestoreOrm();
  return updateAdStudioBriefDetailsInOrganization(params);
}

/** Deletes the brief, its clip and video records, and (best-effort) their files in the bucket. */
export async function deleteAdStudioBrief(params: { organizationId: string; projectId: string; briefId: string; actorId: string }): Promise<void> {
  await ensureFirestoreOrm();
  await deleteAdStudioBriefInOrganization(params);
  try {
    await resolveAdStudioMediaStorage().deletePrefix(adStudioBriefMediaPrefix(params));
  } catch (error) {
    console.error('[ad-studio] removing the media of a deleted brief failed', { briefId: params.briefId, error: error instanceof Error ? error.message : String(error) });
  }
}

export async function getAdStudioClip(organizationId: string, projectId: string, briefId: string, clipId: string): Promise<AdStudioClipModel> {
  await ensureFirestoreOrm();
  return getAdStudioClipInOrganization(organizationId, projectId, briefId, clipId);
}

export async function getAdStudioVideo(organizationId: string, projectId: string, briefId: string, videoId: string): Promise<AdStudioVideoModel> {
  await ensureFirestoreOrm();
  return getAdStudioVideoInOrganization(organizationId, projectId, briefId, videoId);
}

export async function listAdStudioClips(organizationId: string, projectId: string, briefId: string): Promise<AdStudioClipModel[]> {
  await ensureFirestoreOrm();
  return listAdStudioClipsInOrganization(organizationId, projectId, briefId);
}

export async function listAdStudioVideos(organizationId: string, projectId: string, briefId: string): Promise<AdStudioVideoModel[]> {
  await ensureFirestoreOrm();
  return listAdStudioVideosInOrganization(organizationId, projectId, briefId);
}

export async function getAdStudioSettings(organizationId: string, projectId: string): Promise<AdStudioSettingsView> {
  await ensureFirestoreOrm();
  return getAdStudioSettingsInOrganization(organizationId, projectId);
}

export async function setAdStudioSettings(params: {
  organizationId: string;
  projectId: string;
  dailyTextGenerations: number;
  dailyVideoSeconds: number;
  dailyImages?: number;
  videoQa?: { enabled: boolean; retries: number };
  actorId: string;
}): Promise<AdStudioSettingsView> {
  await ensureFirestoreOrm();
  return setAdStudioSettingsInOrganization(params);
}

export async function getAdStudioUsageToday(organizationId: string, projectId: string): Promise<AdStudioUsageToday> {
  await ensureFirestoreOrm();
  return getAdStudioUsageTodayInOrganization(organizationId, projectId);
}

export async function listAdStudioUsage(organizationId: string, projectId: string, limit?: number): Promise<AdStudioUsageModel[]> {
  await ensureFirestoreOrm();
  return listAdStudioUsageInOrganization(organizationId, projectId, limit);
}

export type AdStudioKeywordDataStatus =
  | { available: true; credentialName: string }
  | { available: false; reason: 'no_google_ads_credential' | 'credential_not_configured' | 'vault_not_configured' };

/**
 * Whether deep analysis can look up Google Ads keyword volumes for the project, and why not - for
 * the studio settings panel. Reads the attachment and whether a secret is stored, and whether this
 * deployment has a vault to read it with; nothing is decrypted.
 */
export async function getAdStudioKeywordDataStatus(organizationId: string, projectId: string): Promise<AdStudioKeywordDataStatus> {
  await ensureFirestoreOrm();
  const access = await getAdStudioKeywordAccessInOrganization(organizationId, projectId);
  if (access.status !== 'ok') return { available: false, reason: access.reason };
  try {
    getServerKmsProvider();
  } catch (error) {
    if (error instanceof VaultNotConfiguredError) return { available: false, reason: 'vault_not_configured' };
    throw error;
  }
  return { available: true, credentialName: access.credentialName };
}

/** A brief as the client receives it - plain JSON, no ORM internals. */
export interface AdStudioBriefView {
  id: string;
  name: string;
  objective: string;
  productDescription: string;
  landingPageUrl: string | null;
  format: 'vertical' | 'horizontal';
  language: string;
  targetSeconds: number;
  status: string;
  scenes: AdStudioScene[];
  scriptGeneratedBy: { provider: string; model: string; generatedAt: string } | null;
  plan: AdStudioPlan | null;
  planSources: AdStudioPlanSources | null;
  planGeneratedBy: { provider: string; model: string; generatedAt: string } | null;
  imageConcepts: AdStudioImageConcept[];
  /** The ad copy next to the assembled video (KAN-278); null until written. */
  videoCopy: AdStudioAdCopy | null;
  /** The narrator voice of every scene; null lets the video model choose. */
  voice: AdStudioVoice | null;
  /** The advanced video settings; null means the defaults. */
  videoSettings: AdStudioVideoSettings | null;
  /** The keywords the search ad bids on; null until chosen. */
  searchKeywords: AdStudioSearchKeywords | null;
  /** The responsive search ad; null until written. */
  searchAd: AdStudioSearchAd | null;
  createdOn: string;
  lastChangedOn: string;
}

export function toAdStudioBriefView(brief: AdStudioBriefModel): AdStudioBriefView {
  return {
    id: brief.id,
    name: brief.name,
    objective: brief.objective,
    productDescription: brief.product_description,
    landingPageUrl: brief.landing_page_url ?? null,
    format: brief.video_format,
    language: brief.language,
    targetSeconds: brief.target_seconds,
    status: brief.status,
    scenes: (brief.scenes ?? []).map((scene) => ({ ...scene })),
    scriptGeneratedBy: brief.script_generated_by
      ? { provider: brief.script_generated_by.provider, model: brief.script_generated_by.model, generatedAt: brief.script_generated_by.generated_at }
      : null,
    plan: brief.plan ?? null,
    planSources: brief.plan_sources ?? null,
    planGeneratedBy: brief.plan_generated_by
      ? { provider: brief.plan_generated_by.provider, model: brief.plan_generated_by.model, generatedAt: brief.plan_generated_by.generated_at }
      : null,
    imageConcepts: (brief.image_concepts ?? []).map((concept) => ({ ...concept, formats: [...concept.formats], ...(concept.copy ? { copy: { ...concept.copy } } : {}) })),
    videoCopy: brief.video_copy ? { ...brief.video_copy } : null,
    voice: brief.narrator_voice ? { ...brief.narrator_voice } : null,
    videoSettings: brief.video_settings ? { ...brief.video_settings } : null,
    searchKeywords: brief.search_keywords
      ? { targeting: { ...brief.search_keywords.targeting }, keywords: brief.search_keywords.keywords.map((keyword) => ({ ...keyword })), negatives: [...brief.search_keywords.negatives] }
      : null,
    searchAd: brief.search_ad ? { ...brief.search_ad, headlines: [...brief.search_ad.headlines], descriptions: [...brief.search_ad.descriptions] } : null,
    createdOn: brief.created_on,
    lastChangedOn: brief.last_changed_on,
  };
}

export async function resolveAdStudioExportDestinations(organizationId: string, projectId: string): Promise<AdStudioExportDestinations> {
  await ensureFirestoreOrm();
  return resolveAdStudioExportDestinationsInOrganization(organizationId, projectId);
}

export async function listAdStudioExports(organizationId: string, projectId: string, briefId: string): Promise<AdStudioExportModel[]> {
  await ensureFirestoreOrm();
  return listAdStudioExportsInOrganization(organizationId, projectId, briefId);
}

/** An export as the client receives it. */
export interface AdStudioExportView {
  id: string;
  /** Rows written before image ads existed are videos. */
  mediaKind: 'video' | 'image' | 'search';
  videoId: string | null;
  imageId: string | null;
  destination: 'meta' | 'youtube' | 'google_ads';
  /** The platform's id for the upload (video id, image hash, asset resource name) or the created ad. */
  externalId: string | null;
  /** `ad` when a real (paused) ad was created; `library` for a media upload. */
  resultKind: 'library' | 'ad';
  title: string;
  privacy: string | null;
  status: 'uploading' | 'done' | 'failed';
  externalUrl: string | null;
  failureCode: string | null;
  /** The platform's own explanation of a failure, when it gave one. */
  failureDetail: string | null;
  requestedOn: string;
}

export function toAdStudioExportView(row: AdStudioExportModel): AdStudioExportView {
  return {
    id: row.id,
    mediaKind: row.media_kind ?? 'video',
    videoId: row.video_id ?? null,
    imageId: row.image_id ?? null,
    destination: row.destination,
    externalId: row.external_id ?? null,
    resultKind: row.result_kind ?? 'library',
    title: row.title,
    privacy: row.privacy ?? null,
    status: row.status,
    externalUrl: row.external_url ?? null,
    failureCode: row.failure_code ?? null,
    failureDetail: row.failure_detail ?? null,
    requestedOn: row.requested_on,
  };
}

/** The brief's latest autopilot run, as the page receives it (or null). */
export async function getLatestAdStudioRunView(organizationId: string, projectId: string, briefId: string): Promise<AdStudioRunView | null> {
  await ensureFirestoreOrm();
  const run = await getLatestAdStudioRunInOrganization(organizationId, projectId, briefId);
  return run ? toAdStudioRunView(run) : null;
}
