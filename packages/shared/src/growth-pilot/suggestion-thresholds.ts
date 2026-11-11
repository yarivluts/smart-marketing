/**
 * The numbers behind the Growth Pilot's suggestions for a target with live ads - when "no clicks"
 * is a signal and not a slow start, what click-through counts as low, when results are good enough
 * to suggest more budget. The platform sets defaults; a project may override any of them. Pure, so
 * the admin forms, the server that stores them and the rules that read them agree on every bound.
 */

export interface GrowthSuggestionThresholds {
  /** Days the ads must have been on before "no clicks" is a signal. */
  noClicksAfterDays: number;
  /** Fewer impressions than this and no clicks is still too early to judge. */
  noClicksMinImpressions: number;
  /** Click-through (0-1) below this, over enough impressions, means the ad does not speak to people. */
  lowCtr: number;
  /** Impressions needed before the click-through is judged. */
  lowCtrMinImpressions: number;
  /** Clicks with no conversion: past this many, the page (not the ad) is the likely problem. */
  noConversionsMinClicks: number;
  /** Days the ads must have been on before more budget is suggested. */
  raiseBudgetAfterDays: number;
  /** Click-through (0-1) at or above this counts as good for "raise the budget". */
  raiseBudgetMinCtr: number;
  /** Conversions needed before more budget is suggested. */
  raiseBudgetMinConversions: number;
  /** Share (0-1) of the daily budget spent on average: at or above it the budget, not the ads, is what holds results back. */
  raiseBudgetSpendShare: number;
}

export const GROWTH_SUGGESTION_THRESHOLD_KEYS = [
  'noClicksAfterDays',
  'noClicksMinImpressions',
  'lowCtr',
  'lowCtrMinImpressions',
  'noConversionsMinClicks',
  'raiseBudgetAfterDays',
  'raiseBudgetMinCtr',
  'raiseBudgetMinConversions',
  'raiseBudgetSpendShare',
] as const satisfies readonly (keyof GrowthSuggestionThresholds)[];
export type GrowthSuggestionThresholdKey = (typeof GROWTH_SUGGESTION_THRESHOLD_KEYS)[number];

/** The built-in defaults: what applies until the platform or a project sets its own. */
export const DEFAULT_GROWTH_SUGGESTION_THRESHOLDS: Readonly<GrowthSuggestionThresholds> = Object.freeze({
  noClicksAfterDays: 3,
  noClicksMinImpressions: 300,
  lowCtr: 0.005,
  lowCtrMinImpressions: 1_000,
  noConversionsMinClicks: 30,
  raiseBudgetAfterDays: 3,
  raiseBudgetMinCtr: 0.015,
  raiseBudgetMinConversions: 3,
  raiseBudgetSpendShare: 0.9,
});

/** Each threshold's allowed range, and whether it must be a whole number (counts) or may be a fraction (rates). */
export const GROWTH_SUGGESTION_THRESHOLD_BOUNDS: Readonly<Record<GrowthSuggestionThresholdKey, { min: number; max: number; integer: boolean }>> = Object.freeze({
  noClicksAfterDays: { min: 1, max: 60, integer: true },
  noClicksMinImpressions: { min: 0, max: 1_000_000, integer: true },
  lowCtr: { min: 0, max: 1, integer: false },
  lowCtrMinImpressions: { min: 0, max: 1_000_000, integer: true },
  noConversionsMinClicks: { min: 1, max: 100_000, integer: true },
  raiseBudgetAfterDays: { min: 1, max: 60, integer: true },
  raiseBudgetMinCtr: { min: 0, max: 1, integer: false },
  raiseBudgetMinConversions: { min: 0, max: 100_000, integer: true },
  raiseBudgetSpendShare: { min: 0, max: 1, integer: false },
});

export function isGrowthSuggestionThresholdKey(value: unknown): value is GrowthSuggestionThresholdKey {
  return typeof value === 'string' && (GROWTH_SUGGESTION_THRESHOLD_KEYS as readonly string[]).includes(value);
}

/** Whether one value is allowed for its threshold. */
export function isValidGrowthSuggestionThreshold(key: GrowthSuggestionThresholdKey, value: unknown): value is number {
  const bounds = GROWTH_SUGGESTION_THRESHOLD_BOUNDS[key];
  return typeof value === 'number' && Number.isFinite(value) && value >= bounds.min && value <= bounds.max && (!bounds.integer || Number.isInteger(value));
}

export type GrowthSuggestionThresholdsInput = Partial<Record<GrowthSuggestionThresholdKey, unknown>>;

/**
 * Checks a set of thresholds (all of them, or - with `partial` - only those given): the clean values,
 * or the keys that are out of range or not numbers. Unknown keys are refused too, so a typo in a
 * request is an error and not a silently ignored setting.
 */
export function validateGrowthSuggestionThresholds(
  input: unknown,
  options: { partial?: boolean } = {},
): { ok: true; value: Partial<GrowthSuggestionThresholds> } | { ok: false; invalid: string[] } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, invalid: ['thresholds'] };
  const record = input as Record<string, unknown>;
  const invalid: string[] = Object.keys(record).filter((key) => !isGrowthSuggestionThresholdKey(key));
  const value: Partial<GrowthSuggestionThresholds> = {};
  for (const key of GROWTH_SUGGESTION_THRESHOLD_KEYS) {
    if (!(key in record) || record[key] === undefined) {
      if (!options.partial) invalid.push(key);
      continue;
    }
    if (isValidGrowthSuggestionThreshold(key, record[key])) value[key] = record[key];
    else invalid.push(key);
  }
  return invalid.length ? { ok: false, invalid } : { ok: true, value };
}

/**
 * The thresholds that apply: the project's overrides over the platform's defaults over the built-in
 * ones. A stored value that is no longer valid (bounds tightened since) falls through to the next.
 */
export function resolveGrowthSuggestionThresholds(...layers: (Partial<Record<string, unknown>> | null | undefined)[]): GrowthSuggestionThresholds {
  const out: GrowthSuggestionThresholds = { ...DEFAULT_GROWTH_SUGGESTION_THRESHOLDS };
  // Lowest priority first: the platform, then the project.
  for (const layer of layers) {
    if (!layer) continue;
    for (const key of GROWTH_SUGGESTION_THRESHOLD_KEYS) {
      if (isValidGrowthSuggestionThreshold(key, layer[key])) out[key] = layer[key];
    }
  }
  return out;
}
