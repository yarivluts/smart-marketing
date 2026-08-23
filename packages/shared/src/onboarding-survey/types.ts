/**
 * At-signup structured questions a signup flow (or an onboarding-survey
 * modal) can ask before a visitor becomes a customer (KAN-83, plan `14
 * §Gap 4`: "onboarding-survey ingestion + AI intent/quality score at
 * signup"). A small, fixed set — mirrors `CANCELLATION_REASON_CODES`
 * (KAN-84) and `SURVEY_RESPONSE_SCHEMA_FIELDS` (KAN-82)'s own "curated
 * catalog, not open string" posture, chosen for being the three signals
 * BigBrain's own `survey_account_size`/`intent_breakdown` reports actually
 * scored on: company size (ability to become a large account), budget
 * (ability to pay at all), and urgency (near-term buying intent).
 * `useCase` is free text, descriptive only — not scored (no keyword
 * taxonomy exists for it yet; a future clustering pass could mirror
 * `clusterFeedbackThemes`/`clusterCancellationReasonComments`, not
 * attempted in this slice).
 */
export const COMPANY_SIZE_BANDS = ['1-10', '11-50', '51-200', '201-1000', '1000+'] as const;
export type CompanySizeBand = (typeof COMPANY_SIZE_BANDS)[number];

export const BUDGET_RANGES = ['no_budget', 'under_1k', '1k_10k', '10k_50k', '50k_plus'] as const;
export type BudgetRange = (typeof BUDGET_RANGES)[number];

export const SIGNUP_URGENCIES = ['exploring', 'this_quarter', 'immediately'] as const;
export type SignupUrgency = (typeof SIGNUP_URGENCIES)[number];

export function isCompanySizeBand(value: string): value is CompanySizeBand {
  return (COMPANY_SIZE_BANDS as readonly string[]).includes(value);
}

export function isBudgetRange(value: string): value is BudgetRange {
  return (BUDGET_RANGES as readonly string[]).includes(value);
}

export function isSignupUrgency(value: string): value is SignupUrgency {
  return (SIGNUP_URGENCIES as readonly string[]).includes(value);
}

/** The onboarding survey's structured answers — everything `computeSignupQualityScore` scores, plus the optional free-text `useCase`. */
export interface OnboardingSurveyAnswers {
  readonly companySize: CompanySizeBand;
  readonly budgetRange: BudgetRange;
  readonly urgency: SignupUrgency;
  /** Optional free text, e.g. "replacing a spreadsheet for X". Not scored — descriptive only. */
  readonly useCase?: string;
}

/** One structured answer's contribution to the overall score, for a transparency breakdown UI (`computeSignupQualityScore`'s own return shape). */
export interface SignupQualityScoreBreakdown {
  readonly companySizeScore: number;
  readonly budgetRangeScore: number;
  readonly urgencyScore: number;
  /** The final weighted, rounded, clamped 0-100 score — see `computeSignupQualityScore`'s own doc comment for the weights. */
  readonly score: number;
}
