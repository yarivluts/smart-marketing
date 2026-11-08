import { DEFAULT_GROWTH_SUGGESTION_THRESHOLDS, type GrowthChangeArea, type GrowthPerformanceTotals, type GrowthSuggestionThresholds } from '@growthos/shared';
import type { GrowthProposalView, GrowthTargetView } from './view';

/**
 * What the pilot suggests changing for one target, by fixed rules over its state and its results -
 * deterministic, so the same facts always give the same advice, and every suggestion is something the
 * pilot can actually do: applying one sends the matching change request, makes the video, or opens
 * the budget change (which the person still confirms). The numbers the rules compare against are the
 * project's thresholds (an admin setting over platform defaults); given them, this is a pure function.
 */

export const GROWTH_SUGGESTIONS = ['no_clicks', 'low_ctr', 'no_conversions', 'raise_budget', 'add_video', 'retry_video', 'ads_failed', 'ads_declined', 'landing_failed', 'landing_declined', 'audience_failed'] as const;
export type GrowthSuggestionId = (typeof GROWTH_SUGGESTIONS)[number];

export type GrowthSuggestion = { id: GrowthSuggestionId; action: 'change'; area: GrowthChangeArea } | { id: GrowthSuggestionId; action: 'video' } | { id: GrowthSuggestionId; action: 'budget' };

/** How far back the performance numbers the page reads reach: "spent the whole budget" averages over at most this many days. */
export const RESULTS_WINDOW_DAYS = 30;

export interface GrowthSuggestionInput {
  target: GrowthTargetView;
  proposals: readonly GrowthProposalView[];
  /** The parts the pilot can redo now (see targetChangeAreas). */
  changeAreas: readonly GrowthChangeArea[];
  /** Whether a video model is configured, so a video can be made. */
  videoAvailable: boolean;
  /** Whether the person may change the budget (the publish permission): only then is "raise the budget" offered. */
  canChangeBudget?: boolean;
  /** The daily budget the ads run with now; null when it is not known. */
  dailyBudget?: number | null;
  results?: GrowthPerformanceTotals | null;
  /** The project's thresholds; the built-in defaults when not given. */
  thresholds?: GrowthSuggestionThresholds;
  now: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** How many whole days the ads have been on, from the turn-on decision; null when they are not on. */
export function daysRunning(target: GrowthTargetView, proposals: readonly GrowthProposalView[], now: Date): number | null {
  if (target.publishStatus !== 'running') return null;
  const on = proposals.filter((proposal) => proposal.targetId === target.id && proposal.kind === 'activate' && proposal.status === 'approved').at(-1)?.decidedOn;
  if (!on) return null;
  return Math.floor((now.getTime() - new Date(on).getTime()) / DAY_MS);
}

/** The daily budget its ads run with: kept on the target, or (for ads published before it was kept) the one approved at publishing. */
export function currentDailyBudget(target: GrowthTargetView, proposals: readonly GrowthProposalView[]): number | null {
  if (target.dailyBudget !== null) return target.dailyBudget;
  return proposals.filter((proposal) => proposal.targetId === target.id && proposal.kind === 'publish' && proposal.status === 'approved').at(-1)?.publish?.dailyBudget ?? null;
}

/**
 * Results good enough, and held back by the budget: on for long enough, a good click-through, enough
 * conversions, and most of the daily budget spent on average over the days the numbers cover.
 */
export function budgetHoldsBack(results: GrowthPerformanceTotals, days: number, dailyBudget: number, thresholds: GrowthSuggestionThresholds): boolean {
  if (days < thresholds.raiseBudgetAfterDays || dailyBudget <= 0) return false;
  if (results.ctr === null || results.ctr < thresholds.raiseBudgetMinCtr) return false;
  if (results.conversions < thresholds.raiseBudgetMinConversions) return false;
  const covered = Math.max(1, Math.min(days, RESULTS_WINDOW_DAYS));
  return results.spend / covered >= dailyBudget * thresholds.raiseBudgetSpendShare;
}

export function growthSuggestions(input: GrowthSuggestionInput): GrowthSuggestion[] {
  const { target, results, changeAreas } = input;
  if (target.status !== 'active') return [];
  const limits = input.thresholds ?? DEFAULT_GROWTH_SUGGESTION_THRESHOLDS;
  const out: GrowthSuggestion[] = [];
  const can = (area: GrowthChangeArea) => changeAreas.includes(area);
  const days = daysRunning(target, input.proposals, input.now);

  // Results first: they say most about what to change.
  if (results && days !== null) {
    if (can('ads') && days >= limits.noClicksAfterDays && results.impressions >= limits.noClicksMinImpressions && results.clicks === 0) out.push({ id: 'no_clicks', action: 'change', area: 'ads' });
    else if (can('ads') && results.impressions >= limits.lowCtrMinImpressions && results.clicks > 0 && results.ctr !== null && results.ctr < limits.lowCtr) out.push({ id: 'low_ctr', action: 'change', area: 'ads' });
    if (can('landing') && target.landingStatus === 'published' && results.clicks >= limits.noConversionsMinClicks && results.conversions === 0) out.push({ id: 'no_conversions', action: 'change', area: 'landing' });
    const budget = input.dailyBudget ?? null;
    if (input.canChangeBudget && budget !== null && budgetHoldsBack(results, days, budget, limits)) out.push({ id: 'raise_budget', action: 'budget' });
  }

  if (input.videoAvailable && target.briefId && (target.adsStatus === 'ready' || target.adsStatus === 'approved')) {
    if (target.videoStatus === 'none') out.push({ id: 'add_video', action: 'video' });
    else if (target.videoStatus === 'failed') out.push({ id: 'retry_video', action: 'video' });
  }

  if (can('ads') && target.adsStatus === 'failed') out.push({ id: 'ads_failed', action: 'change', area: 'ads' });
  if (can('ads') && target.adsStatus === 'rejected') out.push({ id: 'ads_declined', action: 'change', area: 'ads' });
  if (can('landing') && target.landingStatus === 'failed') out.push({ id: 'landing_failed', action: 'change', area: 'landing' });
  if (can('landing') && target.landingStatus === 'rejected') out.push({ id: 'landing_declined', action: 'change', area: 'landing' });
  if (can('audience') && target.audienceStatus === 'failed') out.push({ id: 'audience_failed', action: 'change', area: 'audience' });
  return out;
}
