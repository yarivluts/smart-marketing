import 'server-only';
import type { AdStudioBriefInput, AdStudioScene } from '@growthos/shared';
import {
  createAdStudioBrief as createAdStudioBriefInOrganization,
  deleteAdStudioBrief as deleteAdStudioBriefInOrganization,
  getAdStudioBrief as getAdStudioBriefInOrganization,
  getAdStudioClip as getAdStudioClipInOrganization,
  getAdStudioVideo as getAdStudioVideoInOrganization,
  listAdStudioClips as listAdStudioClipsInOrganization,
  listAdStudioVideos as listAdStudioVideosInOrganization,
  getAdStudioSettings as getAdStudioSettingsInOrganization,
  getAdStudioUsageToday as getAdStudioUsageTodayInOrganization,
  listAdStudioBriefs as listAdStudioBriefsInOrganization,
  listAdStudioUsage as listAdStudioUsageInOrganization,
  saveAdStudioScript as saveAdStudioScriptInOrganization,
  setAdStudioSettings as setAdStudioSettingsInOrganization,
  updateAdStudioBriefDetails as updateAdStudioBriefDetailsInOrganization,
  type AdStudioBriefModel,
  type AdStudioClipModel,
  type AdStudioVideoModel,
  type AdStudioSettingsView,
  type AdStudioUsageModel,
  type AdStudioUsageToday,
} from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { adStudioBriefMediaPrefix, resolveAdStudioMediaStorage } from './media-storage';

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

export async function saveAdStudioScript(params: { organizationId: string; projectId: string; briefId: string; scenes: AdStudioScene[] }): Promise<AdStudioBriefModel> {
  await ensureFirestoreOrm();
  return saveAdStudioScriptInOrganization(params);
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
    createdOn: brief.created_on,
    lastChangedOn: brief.last_changed_on,
  };
}
