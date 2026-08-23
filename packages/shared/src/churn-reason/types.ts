/**
 * The fixed structured taxonomy a `churn_reason` event's own `category`
 * field is chosen from (KAN-84, plan `14 §Gap 10`: "cancellation-reason
 * schema (churn_reason structured + free text)"). `other` is the only
 * category that ever falls back to AI clustering — every other value is
 * already a confident, human/app-chosen label and is never re-clustered.
 */
export const CHURN_REASON_CATEGORIES = [
  'too_expensive',
  'missing_features',
  'switched_competitor',
  'poor_support',
  'too_complex',
  'low_usage',
  'no_longer_needed',
  'other',
] as const;
export type ChurnReasonCategory = (typeof CHURN_REASON_CATEGORIES)[number];

export function isChurnReasonCategory(value: string): value is ChurnReasonCategory {
  return (CHURN_REASON_CATEGORIES as readonly string[]).includes(value);
}

/**
 * One theme bucket in the "live taxonomy" a project's landed churn reasons
 * cluster into — `theme` is always one of {@link CHURN_REASON_CATEGORIES},
 * so a structured category and an AI-inferred one from free text always
 * land in the exact same vocabulary a breakdown report groups by.
 */
export interface ChurnReasonThemeCluster {
  readonly theme: ChurnReasonCategory;
  readonly reasonCount: number;
  /** Up to a few example free-text reasons for this theme, in input order. Empty for a theme whose entries were all category-only (no free text given). */
  readonly exampleReasons: readonly string[];
}
