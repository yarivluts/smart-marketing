import type { GrowthChangeArea, GrowthPerformanceTotals } from '@growthos/shared';
import type { GrowthProposalView, GrowthTargetView } from './view';

/**
 * What the pilot suggests changing for one target, by fixed rules over its state and its results -
 * deterministic, so the same facts always give the same advice, and every suggestion is something the
 * pilot can actually do: applying one sends the matching change request (or makes the video).
 */

export const GROWTH_SUGGESTIONS = ['no_clicks', 'low_ctr', 'no_conversions', 'add_video', 'retry_video', 'ads_failed', 'ads_declined', 'landing_failed', 'landing_declined', 'audience_failed'] as const;
export type GrowthSuggestionId = (typeof GROWTH_SUGGESTIONS)[number];

export type GrowthSuggestion = { id: GrowthSuggestionId; action: 'change'; area: GrowthChangeArea } | { id: GrowthSuggestionId; action: 'video' };

/** Days the ads must have been on before "no clicks" is a signal and not just a slow start. */
export const NO_CLICKS_AFTER_DAYS = 3;
/** Fewer impressions than this and no clicks is still too early to judge. */
export const NO_CLICKS_MIN_IMPRESSIONS = 300;
/** Click-through below this, over at least {@link LOW_CTR_MIN_IMPRESSIONS} impressions, means the ad does not speak to people. */
export const LOW_CTR = 0.005;
export const LOW_CTR_MIN_IMPRESSIONS = 1_000;
/** Clicks with no conversion: past this many, the page (not the ad) is the likely problem. */
export const NO_CONVERSIONS_MIN_CLICKS = 30;

export interface GrowthSuggestionInput {
  target: GrowthTargetView;
  proposals: readonly GrowthProposalView[];
  /** The parts the pilot can redo now (see targetChangeAreas). */
  changeAreas: readonly GrowthChangeArea[];
  /** Whether a video model is configured, so a video can be made. */
  videoAvailable: boolean;
  results?: GrowthPerformanceTotals | null;
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

export function growthSuggestions(input: GrowthSuggestionInput): GrowthSuggestion[] {
  const { target, results, changeAreas } = input;
  if (target.status !== 'active') return [];
  const out: GrowthSuggestion[] = [];
  const can = (area: GrowthChangeArea) => changeAreas.includes(area);
  const days = daysRunning(target, input.proposals, input.now);

  // Results first: they say most about what to change.
  if (results && days !== null) {
    if (can('ads') && days >= NO_CLICKS_AFTER_DAYS && results.impressions >= NO_CLICKS_MIN_IMPRESSIONS && results.clicks === 0) out.push({ id: 'no_clicks', action: 'change', area: 'ads' });
    else if (can('ads') && results.impressions >= LOW_CTR_MIN_IMPRESSIONS && results.clicks > 0 && results.ctr !== null && results.ctr < LOW_CTR) out.push({ id: 'low_ctr', action: 'change', area: 'ads' });
    if (can('landing') && target.landingStatus === 'published' && results.clicks >= NO_CONVERSIONS_MIN_CLICKS && results.conversions === 0) out.push({ id: 'no_conversions', action: 'change', area: 'landing' });
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
