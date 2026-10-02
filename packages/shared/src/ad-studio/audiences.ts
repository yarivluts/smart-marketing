/**
 * The Meta audience an ad is planned for: where, which ages and genders, and - from the ad
 * account's real data - existing custom or lookalike audiences and interests, each with the size
 * Meta reported when it was chosen. Publishing to Meta targets exactly this. Pure.
 */

export const AD_STUDIO_META_AGE = { min: 18, max: 65 } as const;
export const AD_STUDIO_MAX_COUNTRIES = 25;
export const AD_STUDIO_MAX_CUSTOM_AUDIENCES = 10;
export const AD_STUDIO_MAX_INTERESTS = 25;
export const AD_STUDIO_GENDERS = ['male', 'female'] as const;
export type AdStudioGender = (typeof AD_STUDIO_GENDERS)[number];

/** An audience or interest, with Meta's size range when it was chosen (null when Meta gave none). */
export interface AdStudioAudienceRef {
  id: string;
  name: string;
  sizeLower: number | null;
  sizeUpper: number | null;
}

export interface AdStudioMetaTargeting {
  /** ISO 3166 alpha-2 codes. */
  countries: string[];
  ageMin: number;
  /** 65 means 65 and over. */
  ageMax: number;
  /** Empty means everyone. */
  genders: AdStudioGender[];
  customAudiences: AdStudioAudienceRef[];
  interests: AdStudioAudienceRef[];
}

/** A broad start: the ad language's main country, every adult. */
export function defaultMetaTargeting(language: string): AdStudioMetaTargeting {
  const base = language.toLowerCase().split('-')[0];
  return { countries: [base === 'he' || base === 'iw' ? 'IL' : 'US'], ageMin: 18, ageMax: 65, genders: [], customAudiences: [], interests: [] };
}

function ref(value: AdStudioAudienceRef): AdStudioAudienceRef {
  const size = (raw: unknown) => (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? raw : null);
  return { id: String(value.id).trim(), name: String(value.name).replace(/\s+/g, ' ').trim(), sizeLower: size(value.sizeLower), sizeUpper: size(value.sizeUpper) };
}

function unique<T>(items: readonly T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const k = key(item);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Targeting as stored: upper-case countries, no repeats, cleaned names. */
export function normalizeMetaTargeting(value: AdStudioMetaTargeting): AdStudioMetaTargeting {
  return {
    countries: unique(value.countries.map((code) => String(code).trim().toUpperCase()), (code) => code),
    ageMin: Math.round(value.ageMin),
    ageMax: Math.round(value.ageMax),
    genders: unique(value.genders, (gender) => gender),
    customAudiences: unique(value.customAudiences.map(ref), (audience) => audience.id),
    interests: unique(value.interests.map(ref), (interest) => interest.id),
  };
}

export type AdStudioTargetingIssueCode =
  | 'no_countries'
  | 'too_many_countries'
  | 'invalid_country'
  | 'invalid_age'
  | 'invalid_gender'
  | 'too_many_audiences'
  | 'too_many_interests'
  | 'invalid_audience';

/** The rules targeting breaks; empty when it can be saved and published. */
export function metaTargetingIssues(value: AdStudioMetaTargeting): AdStudioTargetingIssueCode[] {
  const issues: AdStudioTargetingIssueCode[] = [];
  if (value.countries.length === 0) issues.push('no_countries');
  if (value.countries.length > AD_STUDIO_MAX_COUNTRIES) issues.push('too_many_countries');
  if (value.countries.some((code) => !/^[A-Z]{2}$/.test(code))) issues.push('invalid_country');
  const ages = [value.ageMin, value.ageMax];
  if (ages.some((age) => !Number.isInteger(age) || age < AD_STUDIO_META_AGE.min || age > AD_STUDIO_META_AGE.max) || value.ageMin > value.ageMax) issues.push('invalid_age');
  if (value.genders.some((gender) => !(AD_STUDIO_GENDERS as readonly string[]).includes(gender))) issues.push('invalid_gender');
  if (value.customAudiences.length > AD_STUDIO_MAX_CUSTOM_AUDIENCES) issues.push('too_many_audiences');
  if (value.interests.length > AD_STUDIO_MAX_INTERESTS) issues.push('too_many_interests');
  if ([...value.customAudiences, ...value.interests].some((item) => !/^\d+$/.test(item.id) || !item.name)) issues.push('invalid_audience');
  return issues;
}

/** The ad-set targeting the Meta client takes, from saved targeting. */
export function metaAdSetTargeting(value: AdStudioMetaTargeting): {
  countries: string[];
  ageMin: number;
  ageMax: number;
  genders?: AdStudioGender[];
  customAudiences?: string[];
  interests?: { id: string; name: string }[];
} {
  return {
    countries: value.countries,
    ageMin: value.ageMin,
    ageMax: value.ageMax,
    ...(value.genders.length && value.genders.length < AD_STUDIO_GENDERS.length ? { genders: value.genders } : {}),
    ...(value.customAudiences.length ? { customAudiences: value.customAudiences.map((audience) => audience.id) } : {}),
    ...(value.interests.length ? { interests: value.interests.map((interest) => ({ id: interest.id, name: interest.name })) } : {}),
  };
}

/** A Meta locale for interest names in the ad language. */
export function metaLocaleFor(language: string): string | null {
  const base = language.toLowerCase().split('-')[0];
  return base === 'he' || base === 'iw' ? 'he_IL' : base === 'en' ? 'en_US' : null;
}
