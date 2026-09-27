import 'server-only';
import type { AdStudioBriefInput, AdStudioPlan, AdStudioPlanSources, AdStudioScene } from '@growthos/shared';
import {
  createAdStudioBrief as createAdStudioBriefInOrganization,
  deleteAdStudioBrief as deleteAdStudioBriefInOrganization,
  getAdStudioBrief as getAdStudioBriefInOrganization,
  getAdStudioKeywordAccess as getAdStudioKeywordAccessInOrganization,
  getAdStudioSettings as getAdStudioSettingsInOrganization,
  getAdStudioUsageToday as getAdStudioUsageTodayInOrganization,
  listAdStudioBriefs as listAdStudioBriefsInOrganization,
  listAdStudioUsage as listAdStudioUsageInOrganization,
  saveAdStudioScript as saveAdStudioScriptInOrganization,
  setAdStudioSettings as setAdStudioSettingsInOrganization,
  updateAdStudioBriefDetails as updateAdStudioBriefDetailsInOrganization,
  type AdStudioBriefModel,
  type AdStudioSettingsView,
  type AdStudioUsageModel,
  type AdStudioUsageToday,
} from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { getServerKmsProvider, VaultNotConfiguredError } from '@/lib/vault/kms-provider';

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

export async function deleteAdStudioBrief(params: { organizationId: string; projectId: string; briefId: string; actorId: string }): Promise<void> {
  await ensureFirestoreOrm();
  return deleteAdStudioBriefInOrganization(params);
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
    createdOn: brief.created_on,
    lastChangedOn: brief.last_changed_on,
  };
}
