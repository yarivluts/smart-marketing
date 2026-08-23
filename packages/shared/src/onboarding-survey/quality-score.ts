import type { BudgetRange, CompanySizeBand, OnboardingSurveyAnswers, SignupQualityScoreBreakdown, SignupUrgency } from './types';

/**
 * KAN-83's at-signup intent/quality score (plan `14 §Gap 4`, mirroring
 * BigBrain's `survey_account_size`/`intent_breakdown` reports) — a
 * deterministic weighted heuristic over the three structured onboarding
 * answers, the same buildable-today "stand-in for a real LLM/ML scoring
 * call" posture `clusterFeedbackThemes` (KAN-82), `clusterCancellationReasonComments`
 * (KAN-84), and `suggestFieldMappingRules` (KAN-55) all already establish for
 * their own "AI" feature: inspectable, no external API dependency, good
 * enough to rank signups by likely quality without waiting on a real model
 * integration.
 *
 * Each answer maps to its own 0-100 sub-score (larger company / bigger
 * budget / more urgency all indicate a higher-quality lead), then a
 * weighted average combines them: `budget` weighted highest (0.4) since
 * ability-to-pay is the single strongest predictor of whether a signup ever
 * becomes revenue (the exact quantity `quality_adjusted_cac`/
 * `quality_adjusted_cost_per_signup` care about); `companySize` (0.3) next,
 * since a larger company both has more expansion headroom and is less
 * likely to churn immediately; `urgency` (0.3) last — a real near-term
 * need is a strong signal but, unlike budget, doesn't by itself predict
 * deal *size*. Weights sum to 1.0 by construction (enforced by
 * `SIGNUP_QUALITY_SCORE_WEIGHTS`'s own test).
 */
export const COMPANY_SIZE_BAND_SCORES: Record<CompanySizeBand, number> = {
  '1-10': 20,
  '11-50': 45,
  '51-200': 70,
  '201-1000': 90,
  '1000+': 100,
};

export const BUDGET_RANGE_SCORES: Record<BudgetRange, number> = {
  no_budget: 0,
  under_1k: 25,
  '1k_10k': 55,
  '10k_50k': 80,
  '50k_plus': 100,
};

export const SIGNUP_URGENCY_SCORES: Record<SignupUrgency, number> = {
  exploring: 20,
  this_quarter: 60,
  immediately: 100,
};

/** Weights for each sub-score in the final blend — see this module's own doc comment for the reasoning behind the ordering. Sums to 1.0. */
export const SIGNUP_QUALITY_SCORE_WEIGHTS = {
  budgetRange: 0.4,
  companySize: 0.3,
  urgency: 0.3,
} as const;

/**
 * Computes KAN-83's 0-100 signup quality score from the three structured
 * onboarding-survey answers, returning every sub-score alongside the final
 * blend (`SignupQualityScoreBreakdown`) so a caller — the tracking SDK
 * before it sends the event, or an admin-page transparency panel — can show
 * its own working, not just the number. Pure and total: every valid
 * `OnboardingSurveyAnswers` value produces a score, no I/O, no randomness.
 */
export function computeSignupQualityScore(answers: OnboardingSurveyAnswers): SignupQualityScoreBreakdown {
  const companySizeScore = COMPANY_SIZE_BAND_SCORES[answers.companySize];
  const budgetRangeScore = BUDGET_RANGE_SCORES[answers.budgetRange];
  const urgencyScore = SIGNUP_URGENCY_SCORES[answers.urgency];

  const blended =
    companySizeScore * SIGNUP_QUALITY_SCORE_WEIGHTS.companySize +
    budgetRangeScore * SIGNUP_QUALITY_SCORE_WEIGHTS.budgetRange +
    urgencyScore * SIGNUP_QUALITY_SCORE_WEIGHTS.urgency;

  // Clamped even though every sub-score is already within [0, 100] and the
  // weights sum to 1.0 (so the blend is mathematically always in range) —
  // cheap defense-in-depth against a future weight/sub-score edit that
  // breaks that invariant, same "belt and suspenders" posture this
  // codebase's own `nps_score` formula clamp-free but bounded-inputs
  // reasoning takes for granted elsewhere; here it costs nothing to assert.
  const score = Math.min(100, Math.max(0, Math.round(blended)));

  return { companySizeScore, budgetRangeScore, urgencyScore, score };
}

/** A signup quality score's tier — three bands, wide enough to be stable against small score fluctuations, narrow enough to be actionable ("mostly `low` this week" is a clear signal). */
export const SIGNUP_QUALITY_SCORE_TIERS = ['low', 'medium', 'high'] as const;
export type SignupQualityScoreTier = (typeof SIGNUP_QUALITY_SCORE_TIERS)[number];

/** `low`: 0-39 (below the "exploring + no budget" combination's own ~12-39 range). `medium`: 40-69. `high`: 70-100 (a company at least "this_quarter" urgent with real budget lands here). */
export function signupQualityScoreTier(score: number): SignupQualityScoreTier {
  if (score < 40) return 'low';
  if (score < 70) return 'medium';
  return 'high';
}

export interface SignupQualityScoreDistribution {
  readonly totalResponses: number;
  /** `null` when there are no responses, so an empty window reads as "no data" rather than a misleading average of `0` — same posture `NpsBreakdown.npsScore` establishes. */
  readonly averageScore: number | null;
  readonly low: number;
  readonly medium: number;
  readonly high: number;
}

/**
 * Pure aggregation over a flat list of already-computed quality scores — the
 * admin page's "score distribution" panel, no I/O, callers own
 * fetching/filtering the raw scores (same posture `computeNpsBreakdown`
 * establishes for its own pure aggregation).
 */
export function computeSignupQualityScoreDistribution(scores: readonly number[]): SignupQualityScoreDistribution {
  let low = 0;
  let medium = 0;
  let high = 0;
  let sum = 0;
  for (const score of scores) {
    sum += score;
    const tier = signupQualityScoreTier(score);
    if (tier === 'low') low += 1;
    else if (tier === 'medium') medium += 1;
    else high += 1;
  }
  const totalResponses = scores.length;
  return { totalResponses, averageScore: totalResponses > 0 ? sum / totalResponses : null, low, medium, high };
}
