import { describe, expect, it } from 'vitest';
import { defaultMetaTargeting, metaAdSetTargeting, metaLocaleFor, metaTargetingIssues, normalizeMetaTargeting, type AdStudioMetaTargeting } from './audiences';

const TARGETING: AdStudioMetaTargeting = {
  countries: ['IL'],
  ageMin: 25,
  ageMax: 54,
  genders: ['female'],
  customAudiences: [{ id: '2385', name: 'Website visitors', sizeLower: 1000, sizeUpper: 1200 }],
  interests: [{ id: '6003107902433', name: 'Law', sizeLower: 5000000, sizeUpper: 6000000 }],
};

describe('Meta audience targeting', () => {
  it('starts broad in the ad language country', () => {
    expect(defaultMetaTargeting('he')).toEqual({ countries: ['IL'], ageMin: 18, ageMax: 65, genders: [], customAudiences: [], interests: [] });
    expect(defaultMetaTargeting('en-GB').countries).toEqual(['US']);
    expect(metaLocaleFor('he')).toBe('he_IL');
    expect(metaLocaleFor('fr')).toBeNull();
  });

  it('cleans countries, repeats and names', () => {
    expect(
      normalizeMetaTargeting({ ...TARGETING, countries: [' il', 'IL', 'us'], genders: ['female', 'female'], interests: [...TARGETING.interests, { id: '6003107902433', name: ' Law  again ', sizeLower: Number.NaN, sizeUpper: null }] }),
    ).toEqual({ ...TARGETING, countries: ['IL', 'US'] });
  });

  it('refuses no country, bad codes, impossible ages and too many audiences or interests', () => {
    expect(metaTargetingIssues(TARGETING)).toEqual([]);
    expect(metaTargetingIssues({ ...TARGETING, countries: [] })).toEqual(['no_countries']);
    expect(metaTargetingIssues({ ...TARGETING, countries: ['Israel'] })).toEqual(['invalid_country']);
    expect(metaTargetingIssues({ ...TARGETING, ageMin: 17 })).toEqual(['invalid_age']);
    expect(metaTargetingIssues({ ...TARGETING, ageMin: 40, ageMax: 30 })).toEqual(['invalid_age']);
    expect(metaTargetingIssues({ ...TARGETING, genders: ['other' as never] })).toEqual(['invalid_gender']);
    expect(metaTargetingIssues({ ...TARGETING, customAudiences: Array.from({ length: 11 }, (_, i) => ({ id: String(i + 1), name: 'a', sizeLower: null, sizeUpper: null })) })).toEqual(['too_many_audiences']);
    expect(metaTargetingIssues({ ...TARGETING, interests: [{ id: 'x', name: 'Law', sizeLower: null, sizeUpper: null }] })).toEqual(['invalid_audience']);
  });

  it('becomes the ad-set targeting: both genders means everyone, audiences by id, interests by id and name', () => {
    expect(metaAdSetTargeting(TARGETING)).toEqual({ countries: ['IL'], ageMin: 25, ageMax: 54, genders: ['female'], customAudiences: ['2385'], interests: [{ id: '6003107902433', name: 'Law' }] });
    expect(metaAdSetTargeting({ ...TARGETING, genders: ['male', 'female'], customAudiences: [], interests: [] })).toEqual({ countries: ['IL'], ageMin: 25, ageMax: 54 });
  });
});
