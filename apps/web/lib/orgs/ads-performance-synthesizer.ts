import type { AutomationTargetView, ImportedAdView } from './automation-view';
import type { CampaignDraftView } from '@/components/campaigns/campaign-creatives-panel';
import type { CampaignSpendBreakdownOutcome } from './queries';

/**
 * A campaign as the ads cockpit sees it.
 *
 * Every performance field is nullable, and `null` means exactly one thing: GrowthOS has no
 * measurement for it. That distinction is the point of this module. An earlier version
 * declared these as plain numbers and filled them in by arithmetic on the daily budget —
 * spend was `budget * 30 * 0.88 * factor`, clicks were `spend / (1.25 * platformMultiplier)`,
 * impressions were `clicks * 24` (Google) or `clicks * 45` (Meta), conversions were
 * `clicks * 0.082`, and ROAS was `3.2 * platformMultiplier`. The multiplier came from a hash
 * of the campaign id, so the invented figures were stable across reloads and moved plausibly
 * between campaigns, which made them indistinguishable from measurements.
 *
 * The only performance number the warehouse actually supplies today is spend, per campaign
 * (`getCampaignSpendBreakdownForProject` sums one metric). There is no impressions, clicks or
 * conversions source wired up, so those stay null until one exists — a campaign with no data
 * has to look like a campaign with no data, especially here: `recommendation-synthesizer`
 * reads `roas` to propose pausing real campaigns, and it must never act on a guess.
 */
export interface UnifiedCampaignItem {
  id: string;
  targetId: string;
  label: string;
  platform: 'google_ads' | 'meta_ads' | 'simulated';
  status: 'enabled' | 'paused' | 'removed' | 'none';
  dailyBudgetUsd: number;
  /** Real 30-day spend from the warehouse; null when the warehouse has none for this campaign. */
  spend30dUsd: number | null;
  /** Null until a revenue-attribution source exists. Never inferred from spend. */
  roas: number | null;
  /** Null until an impressions/clicks source exists. */
  impressions: number | null;
  clicks: number | null;
  ctrPct: number | null;
  cpaUsd: number | null;
  conversions: number | null;
  objective?: string;
  campaignResourceName?: string;
  lastActionAt?: string;
  lastReadStateAt?: string;
  activeActivationActionId?: string;
  draft?: CampaignDraftView;
  importedAds?: ImportedAdView[];
}

export interface AdsPerformanceSummary {
  /** Sum of the campaigns that had real spend. Null when none did. */
  totalSpendUsd: number | null;
  metaSpendUsd: number | null;
  googleSpendUsd: number | null;
  simulatedSpendUsd: number | null;
  blendedRoas: number | null;
  totalImpressions: number | null;
  totalClicks: number | null;
  blendedCtrPct: number | null;
  blendedCpaUsd: number | null;
  totalConversions: number | null;
  /** Counts of campaign rows — always real, they come from the target list itself. */
  activeCampaignsCount: number;
  totalCampaignsCount: number;
  /** How many campaigns contributed a real spend figure, for "3 of 12 measured" copy. */
  campaignsWithSpendCount: number;
}

function resolvePlatform(
  target: AutomationTargetView,
  draft: CampaignDraftView | undefined,
): UnifiedCampaignItem['platform'] {
  if (
    target.externalPlatform === 'meta_ads' ||
    (draft && draft.platform === 'meta') ||
    target.resourceAttachmentId
  ) {
    return 'meta_ads';
  }
  if (target.externalPlatform === 'google_ads' || (draft && draft.platform === 'google_ads')) {
    return 'google_ads';
  }

  // Last resort, and a guess rather than a fact: the campaign's own name. Kept because a
  // mislabelled platform only affects grouping, never a number.
  const label = target.label.toLowerCase();
  if (label.includes('meta') || label.includes('facebook') || label.includes('instagram')) {
    return 'meta_ads';
  }
  if (label.includes('google') || label.includes('search')) {
    return 'google_ads';
  }
  return 'simulated';
}

/**
 * Joins Firestore target rows to whatever the warehouse actually measured. Campaigns with no
 * warehouse row keep null metrics rather than estimated ones.
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
      // Skipped rather than counted as zero: a null actualSpend means the
      // project has no spend data for the window, and folding that in as 0 would
      // make an unmeasured campaign look like a free one.
      if (row.actualSpend !== null) {
        spendByCampaignId.set(row.campaignId, row.actualSpend);
      }
    }
  }

  let totalSpend = 0;
  let metaSpend = 0;
  let googleSpend = 0;
  let simulatedSpend = 0;
  let campaignsWithSpendCount = 0;

  const items: UnifiedCampaignItem[] = targets.map((target) => {
    const draft = draftsByTargetId?.get(target.id);
    const platform = resolvePlatform(target, draft);

    const rawSpend =
      spendByCampaignId.get(target.campaignResourceName ?? target.id) ??
      spendByCampaignId.get(target.label);
    // A measured zero is a real reading and must stay 0, not collapse to null.
    const spend30dUsd = typeof rawSpend === 'number' && Number.isFinite(rawSpend) ? rawSpend : null;

    if (spend30dUsd !== null) {
      campaignsWithSpendCount += 1;
      totalSpend += spend30dUsd;
      if (platform === 'meta_ads') {
        metaSpend += spend30dUsd;
      } else if (platform === 'google_ads') {
        googleSpend += spend30dUsd;
      } else {
        simulatedSpend += spend30dUsd;
      }
    }

    return {
      id: target.id,
      targetId: target.id,
      label: target.label,
      platform,
      status: (target.campaignStatus ?? 'enabled') as UnifiedCampaignItem['status'],
      dailyBudgetUsd: target.dailyBudgetUsd,
      spend30dUsd,
      roas: null,
      impressions: null,
      clicks: null,
      ctrPct: null,
      cpaUsd: null,
      conversions: null,
      objective: target.importedObjective,
      campaignResourceName: target.campaignResourceName,
      lastActionAt: lastActionAtByTarget?.get(target.id),
      lastReadStateAt: target.lastReadStateAt,
      activeActivationActionId: activeActivationActionIdByTarget?.get(target.id),
      draft,
      importedAds: target.importedAds,
    };
  });

  const anySpend = campaignsWithSpendCount > 0;

  const summary: AdsPerformanceSummary = {
    totalSpendUsd: anySpend ? totalSpend : null,
    metaSpendUsd: anySpend ? metaSpend : null,
    googleSpendUsd: anySpend ? googleSpend : null,
    simulatedSpendUsd: anySpend ? simulatedSpend : null,
    // Each of these needs a source the warehouse does not expose yet. Reporting null keeps
    // the cockpit honest instead of printing a plausible constant.
    blendedRoas: null,
    totalImpressions: null,
    totalClicks: null,
    blendedCtrPct: null,
    blendedCpaUsd: null,
    totalConversions: null,
    activeCampaignsCount: items.filter((i) => i.status === 'enabled').length,
    totalCampaignsCount: items.length,
    campaignsWithSpendCount,
  };

  return { items, summary };
}
