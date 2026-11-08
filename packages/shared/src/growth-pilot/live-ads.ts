/**
 * The ads a Growth Pilot target has live on Meta: the daily budget the person may set for them, and
 * the link that opens them in Meta Ads Manager. Pure, so the server that changes a budget and the
 * page that offers the change apply the same rule.
 */

/** The smallest daily budget the pilot accepts, in the ad account's currency (Meta refuses less in every currency it supports). */
export const GROWTH_MIN_DAILY_BUDGET = 1;
/** The largest daily budget the pilot accepts, in the ad account's currency: a typo guard, not a spending policy. */
export const GROWTH_MAX_DAILY_BUDGET = 100_000;

/** Whether `value` is a daily budget the pilot may publish with or change to: a number from the minimum to the maximum. */
export function isValidGrowthDailyBudget(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= GROWTH_MIN_DAILY_BUDGET && value <= GROWTH_MAX_DAILY_BUDGET;
}

/** The Meta ids of a target's published ads, as stored when they were published. */
export interface GrowthMetaRefs {
  /** The ad account, without the `act_` prefix. */
  adAccountId: string;
  campaignId: string;
  adSetIds: string[];
  adIds: string[];
}

/** An ad account id as Ads Manager's `act` parameter takes it: digits only, no `act_` prefix. */
export function metaAdAccountNumber(adAccountId: string): string {
  return adAccountId.trim().replace(/^act_/i, '');
}

/**
 * The address that opens a target's campaign in Meta Ads Manager, on its ads tab with the campaign
 * selected - the same form the Ad Studio's publish step links each ad with. Null when an id is
 * missing or not numeric (Meta ids are), so the page never links somewhere wrong.
 */
export function metaAdsManagerUrl(refs: Pick<GrowthMetaRefs, 'adAccountId' | 'campaignId'> | null | undefined): string | null {
  if (!refs) return null;
  const account = metaAdAccountNumber(refs.adAccountId ?? '');
  const campaign = (refs.campaignId ?? '').trim();
  if (!/^\d+$/.test(account) || !/^\d+$/.test(campaign)) return null;
  const query = new URLSearchParams({ act: account, selected_campaign_ids: campaign });
  return `https://adsmanager.facebook.com/adsmanager/manage/ads?${query.toString()}`;
}
