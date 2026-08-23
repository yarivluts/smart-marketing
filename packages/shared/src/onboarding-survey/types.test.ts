import { describe, expect, it } from 'vitest';
import { BUDGET_RANGES, COMPANY_SIZE_BANDS, SIGNUP_URGENCIES, isBudgetRange, isCompanySizeBand, isSignupUrgency } from './types';

describe('isCompanySizeBand', () => {
  it('accepts every declared band', () => {
    for (const band of COMPANY_SIZE_BANDS) {
      expect(isCompanySizeBand(band)).toBe(true);
    }
  });

  it('rejects a value outside the taxonomy', () => {
    expect(isCompanySizeBand('gigantic')).toBe(false);
  });
});

describe('isBudgetRange', () => {
  it('accepts every declared range', () => {
    for (const range of BUDGET_RANGES) {
      expect(isBudgetRange(range)).toBe(true);
    }
  });

  it('rejects a value outside the taxonomy', () => {
    expect(isBudgetRange('unlimited')).toBe(false);
  });
});

describe('isSignupUrgency', () => {
  it('accepts every declared urgency', () => {
    for (const urgency of SIGNUP_URGENCIES) {
      expect(isSignupUrgency(urgency)).toBe(true);
    }
  });

  it('rejects a value outside the taxonomy', () => {
    expect(isSignupUrgency('never')).toBe(false);
  });
});
