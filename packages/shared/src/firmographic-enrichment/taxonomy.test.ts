import { describe, expect, it } from 'vitest';
import {
  EMPLOYEE_COUNT_RANGES,
  FIRMOGRAPHIC_REGIONS,
  INDUSTRY_CATEGORIES,
  isEmployeeCountRange,
  isFirmographicRegion,
  isIndustryCategory,
} from './taxonomy';

describe('isIndustryCategory', () => {
  it('accepts every declared taxonomy category', () => {
    for (const category of INDUSTRY_CATEGORIES) {
      expect(isIndustryCategory(category)).toBe(true);
    }
  });

  it('rejects a value outside the taxonomy', () => {
    expect(isIndustryCategory('made_up_industry')).toBe(false);
  });
});

describe('isEmployeeCountRange', () => {
  it('accepts every declared band', () => {
    for (const band of EMPLOYEE_COUNT_RANGES) {
      expect(isEmployeeCountRange(band)).toBe(true);
    }
  });

  it('rejects a value outside the taxonomy', () => {
    expect(isEmployeeCountRange('5000+')).toBe(false);
  });
});

describe('isFirmographicRegion', () => {
  it('accepts every declared region', () => {
    for (const region of FIRMOGRAPHIC_REGIONS) {
      expect(isFirmographicRegion(region)).toBe(true);
    }
  });

  it('rejects a value outside the taxonomy', () => {
    expect(isFirmographicRegion('antarctica')).toBe(false);
  });
});
