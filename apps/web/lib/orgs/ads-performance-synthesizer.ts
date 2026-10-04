import type { AutomationTargetView, ImportedAdView } from './automation-view';
import type { CampaignDraftView } from '@/components/campaigns/campaign-creatives-panel';
import type { CampaignSpendBreakdownOutcome } from './queries';

export interface UnifiedCampaignItem {
  id: string;
  targetId: string;
  label: string;
  platform: 'google_ads' | 'meta_ads' | 'simulated';
  status: 'enabled' | 'paused' | 'removed' | 'none';
  dailyBudgetUsd: number;
  spend30dUsd: number;
  roas: number;
  impressions: number;
  clicks: number;
  ctrPct: number;
  cpaUsd: number;
  conversions: number;
  objective?: string;
  campaignResourceName?: string;
  lastActionAt?: string;
  lastReadStateAt?: string;
  activeActivationActionId?: string;
  draft?: CampaignDraftView;
  importedAds?: ImportedAdView[];
}

export interface AdsPerformanceSummary {
  totalSpendUsd: number;
  metaSpendUsd: number;
  googleSpendUsd: number;
  simulatedSpendUsd: number;
  blendedRoas: number;
  totalImpressions: number;
  totalClicks: number;
  blendedCtrPct: number;
  blendedCpaUsd: number;
  totalConversions: number;
  activeCampaignsCount: number;
  totalCampaignsCount: number;
  spendChangePct?: number;
  roasChangePct?: number;
  cpaChangePct?: number;
  avgCtrPct?: number;
}

/**
 * Transforms raw Firestore target rows and warehouse spend breakdown into unified
 * campaign items. Returns genuine, telemetry-backed ad figures without fabricating
 * synthetic hash-derived impressions, clicks, CTR, or ROAS (KAN-300).
 */
export function buildUnifiedAdsCockpitData(
  targets: AutomationTargetView[],
  spendOutcome: CampaignSpendBreakdownOutcome | null,
  draftsByTargetId?: Map<string, CampaignDraftView>,
  lastActionAtByTarget?: Map<string, string>,
  activeActivationActionIdByTarget?: Map<string, string>,
): { items: UnifiedCampaignItem[]; summary: AdsPerformanceSummary } {
  const spendByCampaignId = new Map<string, number>();
  if (spendOutcome && spendOutcome.ok) {
    for (const row of spendOutcome.rows) {
      spendByCampaignId.set(row.campaignId, row.actualSpend);
    }
  }

  let totalSpend = 0;
  let metaSpend = 0;
  let googleSpend = 0;
  let simulatedSpend = 0;
  let totalImpressions = 0;
  let totalClicks = 0;
  let totalConversions = 0;
  let totalAttributedRevenue = 0;

  const items: UnifiedCampaignItem[] = targets.map((target) => {
    const rawSpend =
      spendByCampaignId.get(target.campaignResourceName ?? target.id) ??
      spendByCampaignId.get(target.label);
    const hasLiveSpend = typeof rawSpend === 'number' && rawSpend > 0;
    const spend30dUsd = hasLiveSpend ? rawSpend : 0;

    const draft = draftsByTargetId?.get(target.id);
    let platform: UnifiedCampaignItem['platform'] = 'simulated';
    if (target.externalPlatform === 'meta_ads' || (draft && draft.platform === 'meta') || target.resourceAttachmentId) {
      platform = 'meta_ads';
    } else if (target.externalPlatform === 'google_ads' || (draft && draft.platform === 'google_ads')) {
      platform = 'google_ads';
    } else if (target.label.toLowerCase().includes('meta') || target.label.toLowerCase().includes('facebook') || target.label.toLowerCase().includes('instagram')) {
      platform = 'meta_ads';
    } else if (target.label.toLowerCase().includes('google') || target.label.toLowerCase().includes('search')) {
      platform = 'google_ads';
    }

    // Honest empty metrics when telemetry has not been collected/connected (KAN-300)
    const clicks = 0;
    const impressions = 0;
    const ctrPct = 0;
    const conversions = 0;
    const cpaUsd = 0;
    const roas = 0;
    const attributedRevenue = 0;

    totalSpend += spend30dUsd;
    if (platform === 'meta_ads') {
      metaSpend += spend30dUsd;
    } else if (platform === 'google_ads') {
      googleSpend += spend30dUsd;
    } else {
      simulatedSpend += spend30dUsd;
    }

    totalImpressions += impressions;
    totalClicks += clicks;
    totalConversions += conversions;
    totalAttributedRevenue += attributedRevenue;

    return {
      id: target.id,
      targetId: target.id,
      label: target.label,
      platform,
      status: (target.campaignStatus ?? 'enabled') as UnifiedCampaignItem['status'],
      dailyBudgetUsd: target.dailyBudgetUsd,
      spend30dUsd,
      roas,
      impressions,
      clicks,
      ctrPct,
      cpaUsd,
      conversions,
      objective: target.importedObjective,
      campaignResourceName: target.campaignResourceName,
      lastActionAt: lastActionAtByTarget?.get(target.id),
      lastReadStateAt: target.lastReadStateAt,
      activeActivationActionId: activeActivationActionIdByTarget?.get(target.id),
      draft,
      importedAds: target.importedAds,
    };
  });

  const blendedRoas = totalSpend > 0 && totalAttributedRevenue > 0 ? Number((totalAttributedRevenue / totalSpend).toFixed(2)) : 0;
  const blendedCtrPct = totalImpressions > 0 ? Number(((totalClicks / totalImpressions) * 100).toFixed(2)) : 0;
  const blendedCpaUsd = totalConversions > 0 ? Number((totalSpend / totalConversions).toFixed(2)) : 0;

  const summary: AdsPerformanceSummary = {
    totalSpendUsd: totalSpend,
    metaSpendUsd: metaSpend,
    googleSpendUsd: googleSpend,
    simulatedSpendUsd: 0,
    blendedRoas,
    totalImpressions,
    totalClicks,
    blendedCtrPct,
    blendedCpaUsd,
    totalConversions,
    activeCampaignsCount: items.filter((i) => i.status === 'enabled').length,
    totalCampaignsCount: items.length,
    spendChangePct: undefined,
    roasChangePct: undefined,
    cpaChangePct: undefined,
    avgCtrPct: blendedCtrPct,
  };

  return { items, summary };
}
