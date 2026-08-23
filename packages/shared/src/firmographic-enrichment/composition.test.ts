import { describe, expect, it } from 'vitest';
import { computeFirmographicIndustryBreakdown } from './composition';

describe('computeFirmographicIndustryBreakdown', () => {
  it('counts and sorts most-common industry first', () => {
    const result = computeFirmographicIndustryBreakdown(['saas_software', 'healthcare', 'saas_software', 'saas_software', 'healthcare']);
    expect(result).toEqual([
      { industry: 'saas_software', count: 3 },
      { industry: 'healthcare', count: 2 },
    ]);
  });

  it('breaks ties alphabetically', () => {
    const result = computeFirmographicIndustryBreakdown(['saas_software', 'healthcare']);
    expect(result).toEqual([
      { industry: 'healthcare', count: 1 },
      { industry: 'saas_software', count: 1 },
    ]);
  });

  it('returns an empty array for no records', () => {
    expect(computeFirmographicIndustryBreakdown([])).toEqual([]);
  });
});
