import type { AdStudioCampaignAd, AdStudioCampaignEvidence, AdStudioCampaignSummary, AdStudioSourceState } from '@growthos/shared';
import { SharedCredentialModel } from '../models/shared-credential.model';
import type { ResourceAttachmentModel } from '../models/resource-attachment.model';
import type { AutomationTargetStateModel } from '../models/automation-target-state.model';
import type { KmsProvider } from '../vault/kms-provider';
import { UnknownKmsKeyError } from '../vault/local-kms-provider';
import { InvalidGoogleAdsCredentialSecretError, type GoogleAdsCredentialSecret } from '../plugin-runtime/google-ads';
import { listAutomationTargetStatesForProject } from './automation.service';
import { GoogleAdsCredentialConfigError, resolveGoogleAdsCredentialSecret } from './google-ads-plugin.service';
import { listActiveAttachmentsForProject } from './resource-library.service';

/**
 * Reads the Ad Studio's planning stage (KAN-230) needs from the project's own records: its
 * campaigns and their imported ads, and the Google Ads credential a keyword-volume lookup runs on.
 * Each comes back as a state with a stable reason code when there is nothing to use.
 */

/** How much of the campaign history a plan reads - the most relevant campaigns and a few ads of each. */
export const AD_STUDIO_MAX_PLAN_CAMPAIGNS = 20;
export const AD_STUDIO_MAX_PLAN_ADS_PER_CAMPAIGN = 5;
const MAX_AD_TEXT_CHARS = 300;

const STATUS_ORDER: Record<string, number> = { enabled: 0, paused: 1, removed: 2 };

function adText(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, MAX_AD_TEXT_CHARS) : '';
}

/** The ads stored verbatim at import time (`imported_ads_json`); a malformed document reads as no ads. */
function importedAds(raw: string | undefined): AdStudioCampaignAd[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { ads?: unknown };
    if (!Array.isArray(parsed.ads)) return [];
    return parsed.ads
      .map((ad) => {
        const record = (ad && typeof ad === 'object' ? ad : {}) as Record<string, unknown>;
        return { headline: adText(record.headline), primaryText: adText(record.primaryText), description: adText(record.description) };
      })
      .filter((ad) => ad.headline || ad.primaryText || ad.description)
      .slice(0, AD_STUDIO_MAX_PLAN_ADS_PER_CAMPAIGN);
  } catch {
    return [];
  }
}

export function toAdStudioCampaignSummary(target: AutomationTargetStateModel): AdStudioCampaignSummary {
  return {
    label: target.label,
    platform: target.external_platform ?? null,
    status: target.campaign_status ?? null,
    dailyBudgetUsd: Number.isFinite(target.daily_budget_usd) ? target.daily_budget_usd : null,
    ads: importedAds(target.imported_ads_json),
  };
}

/**
 * The project's campaigns (in the given environment when there is one) with their imported ads:
 * live campaigns first, then paused, then removed, each group by budget. `no_campaigns` when the
 * project has none - not an empty list the plan could mistake for "no ads ever worked".
 */
export async function getAdStudioCampaignEvidence(
  organizationId: string,
  projectId: string,
  environmentId: string | null,
): Promise<AdStudioSourceState<AdStudioCampaignEvidence, 'no_campaigns'>> {
  const targets = (await listAutomationTargetStatesForProject(organizationId, projectId)).filter((target) => environmentId === null || target.environment_id === environmentId);
  if (targets.length === 0) return { status: 'unavailable', reason: 'no_campaigns' };
  const campaigns = targets
    .map(toAdStudioCampaignSummary)
    .sort((a, b) => (STATUS_ORDER[a.status ?? ''] ?? 3) - (STATUS_ORDER[b.status ?? ''] ?? 3) || (b.dailyBudgetUsd ?? 0) - (a.dailyBudgetUsd ?? 0) || a.label.localeCompare(b.label))
    .slice(0, AD_STUDIO_MAX_PLAN_CAMPAIGNS);
  return { status: 'ok', campaigns };
}

export type AdStudioKeywordAccessReason = 'no_google_ads_credential' | 'credential_not_configured';

export type AdStudioKeywordAccess =
  | { status: 'ok'; credentialName: string; attachment: ResourceAttachmentModel }
  | { status: 'unavailable'; reason: AdStudioKeywordAccessReason };

/**
 * Whether the project holds an approved Google Ads credential with a secret set - checked without
 * decrypting anything, so the studio's settings panel can say why keyword volumes are missing.
 */
export async function getAdStudioKeywordAccess(organizationId: string, projectId: string): Promise<AdStudioKeywordAccess> {
  const attachments = (await listActiveAttachmentsForProject(organizationId, projectId)).filter((attachment) => attachment.resource_kind === 'credential');
  let withoutSecret = false;
  for (const attachment of attachments) {
    const credential = await SharedCredentialModel.init(attachment.resource_id, { organization_id: organizationId });
    if (!credential || credential.provider !== 'google_ads') continue;
    if (credential.encrypted_secret) return { status: 'ok', credentialName: credential.name, attachment };
    withoutSecret = true;
  }
  return { status: 'unavailable', reason: withoutSecret ? 'credential_not_configured' : 'no_google_ads_credential' };
}

export type AdStudioKeywordCredential =
  | { status: 'ok'; credential: GoogleAdsCredentialSecret }
  | { status: 'unavailable'; reason: AdStudioKeywordAccessReason | 'vault_not_configured' };

/**
 * The decrypted Google Ads credential for a keyword lookup, in memory only. `kms` is null when the
 * deployment has no vault configured, which makes every stored secret unreadable.
 */
export async function resolveAdStudioKeywordCredential(organizationId: string, projectId: string, kms: KmsProvider | null): Promise<AdStudioKeywordCredential> {
  const access = await getAdStudioKeywordAccess(organizationId, projectId);
  if (access.status !== 'ok') return access;
  if (!kms) return { status: 'unavailable', reason: 'vault_not_configured' };
  try {
    return { status: 'ok', credential: await resolveGoogleAdsCredentialSecret(organizationId, access.attachment, kms) };
  } catch (error) {
    if (error instanceof GoogleAdsCredentialConfigError || error instanceof InvalidGoogleAdsCredentialSecretError || error instanceof UnknownKmsKeyError) return { status: 'unavailable', reason: 'credential_not_configured' };
    throw error;
  }
}
