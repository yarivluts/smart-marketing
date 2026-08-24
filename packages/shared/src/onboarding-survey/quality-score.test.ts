import { describe, expect, it } from 'vitest';
import { BUDGET_RANGES, COMPANY_SIZE_BANDS, SIGNUP_URGENCIES } from './types';
import { SIGNUP_QUALITY_SCORE_WEIGHTS, computeSignupQualityScore, computeSignupQualityScoreDistribution, signupQualityScoreTier } from './quality-score';

describe('SIGNUP_QUALITY_SCORE_WEIGHTS', () => {
  it('sums to 1.0', () => {
    const sum = SIGNUP_QUALITY_SCORE_WEIGHTS.budgetRange + SIGNUP_QUALITY_SCORE_WEIGHTS.companySize + SIGNUP_QUALITY_SCORE_WEIGHTS.urgency;
    expect(sum).toBeCloseTo(1.0, 10);
  });
});

describe('computeSignupQualityScore', () => {
  it('scores the weakest possible signup at (or near) 0', () => {
    const result = computeSignupQualityScore({ companySize: '1-10', budgetRange: 'no_budget', urgency: 'exploring' });
    // 20*0.3 + 0*0.4 + 20*0.3 = 12
    expect(result.score).toBe(12);
    expect(result.companySizeScore).toBe(20);
    expect(result.budgetRangeScore).toBe(0);
    expect(result.urgencyScore).toBe(20);
  });

  it('scores the strongest possible signup at 100', () => {
    const result = computeSignupQualityScore({ companySize: '1000+', budgetRange: '50k_plus', urgency: 'immediately' });
    expect(result.score).toBe(100);
  });

  it('blends a mixed-signal signup as the documented weighted average', () => {
    // 51-200 -> 70, 10k_50k -> 80, this_quarter -> 60
    // 70*0.3 + 80*0.4 + 60*0.3 = 21 + 32 + 18 = 71
    const result = computeSignupQualityScore({ companySize: '51-200', budgetRange: '10k_50k', urgency: 'this_quarter' });
    expect(result.score).toBe(71);
  });

  it('weights budget more than company size or urgency (a bigger budget with weak other signals beats the reverse)', () => {
    const budgetLed = computeSignupQualityScore({ companySize: '1-10', budgetRange: '50k_plus', urgency: 'exploring' });
    const sizeLed = computeSignupQualityScore({ companySize: '1000+', budgetRange: 'no_budget', urgency: 'exploring' });
    expect(budgetLed.score).toBeGreaterThan(sizeLed.score);
  });

  it('produces a score within [0, 100] for every combination of the taxonomy', () => {
    for (const companySize of COMPANY_SIZE_BANDS) {
      for (const budgetRange of BUDGET_RANGES) {
        for (const urgency of SIGNUP_URGENCIES) {
          const result = computeSignupQualityScore({ companySize, budgetRange, urgency });
          expect(result.score).toBeGreaterThanOrEqual(0);
          expect(result.score).toBeLessThanOrEqual(100);
          expect(Number.isInteger(result.score)).toBe(true);
        }
      }
    }
  });

  it('is deterministic — the same answers always produce the same score', () => {
    const answers = { companySize: '11-50', budgetRange: '1k_10k', urgency: 'this_quarter' } as const;
    const first = computeSignupQualityScore(answers);
    const second = computeSignupQualityScore(answers);
    expect(first).toEqual(second);
  });

  it('ignores the optional free-text useCase field when scoring', () => {
    const withUseCase = computeSignupQualityScore({ companySize: '11-50', budgetRange: '1k_10k', urgency: 'this_quarter', useCase: 'replacing spreadsheets' });
    const withoutUseCase = computeSignupQualityScore({ companySize: '11-50', budgetRange: '1k_10k', urgency: 'this_quarter' });
    expect(withUseCase.score).toBe(withoutUseCase.score);
  });
});

describe('signupQualityScoreTier', () => {
  it('classifies the three bands at their boundaries', () => {
    expect(signupQualityScoreTier(0)).toBe('low');
    expect(signupQualityScoreTier(39)).toBe('low');
    expect(signupQualityScoreTier(40)).toBe('medium');
    expect(signupQualityScoreTier(69)).toBe('medium');
    expect(signupQualityScoreTier(70)).toBe('high');
    expect(signupQualityScoreTier(100)).toBe('high');
  });
});

describe('computeSignupQualityScoreDistribution', () => {
  it('returns a null average and zero counts for an empty list', () => {
    const result = computeSignupQualityScoreDistribution([]);
    expect(result).toEqual({ totalResponses: 0, averageScore: null, low: 0, medium: 0, high: 0 });
  });

  it('buckets scores into low/medium/high and computes the average', () => {
    const result = computeSignupQualityScoreDistribution([10, 45, 45, 90]);
    expect(result.totalResponses).toBe(4);
    expect(result.low).toBe(1);
    expect(result.medium).toBe(2);
    expect(result.high).toBe(1);
    expect(result.averageScore).toBeCloseTo(47.5, 10);
  });
});
