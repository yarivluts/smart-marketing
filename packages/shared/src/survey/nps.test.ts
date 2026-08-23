import { describe, expect, it } from 'vitest';
import { classifyNpsScore, computeNpsBreakdown } from './nps';

describe('classifyNpsScore', () => {
  it('classifies 9 and 10 as promoter', () => {
    expect(classifyNpsScore(9)).toBe('promoter');
    expect(classifyNpsScore(10)).toBe('promoter');
  });

  it('classifies 7 and 8 as passive', () => {
    expect(classifyNpsScore(7)).toBe('passive');
    expect(classifyNpsScore(8)).toBe('passive');
  });

  it('classifies 0-6 as detractor', () => {
    expect(classifyNpsScore(6)).toBe('detractor');
    expect(classifyNpsScore(0)).toBe('detractor');
  });
});

describe('computeNpsBreakdown', () => {
  it('returns a null score and zero counts for an empty list', () => {
    expect(computeNpsBreakdown([])).toEqual({
      totalResponses: 0,
      promoters: 0,
      passives: 0,
      detractors: 0,
      npsScore: null,
    });
  });

  it('computes the standard NPS formula from mixed scores', () => {
    // promoters: 10, 9, 9 (3); passive: 8 (1); detractor: 4 (1) -> (3-1)/5*100 = 40
    const breakdown = computeNpsBreakdown([10, 9, 9, 8, 4]);
    expect(breakdown).toEqual({
      totalResponses: 5,
      promoters: 3,
      passives: 1,
      detractors: 1,
      npsScore: 40,
    });
  });

  it('rounds to one decimal place', () => {
    // promoters: 1, detractors: 2, total: 3 -> (1-2)/3*100 = -33.333... -> -33.3
    const breakdown = computeNpsBreakdown([9, 1, 2]);
    expect(breakdown.npsScore).toBe(-33.3);
  });

  it('returns a score of -100 when every response is a detractor', () => {
    expect(computeNpsBreakdown([0, 1, 2]).npsScore).toBe(-100);
  });

  it('returns a score of 100 when every response is a promoter', () => {
    expect(computeNpsBreakdown([9, 10]).npsScore).toBe(100);
  });
});
