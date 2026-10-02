import type { AdStudioAudienceRef, AdStudioGender, AdStudioMetaTargeting } from '@growthos/shared';

/**
 * Meta targeting from a request body - shape only, as typed values; the rules are checked by the
 * caller (`metaTargetingIssues`). Undefined when it is not a targeting object at all.
 */
export function parseMetaTargeting(value: unknown): AdStudioMetaTargeting | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  if (
    !Array.isArray(raw.countries) ||
    typeof raw.ageMin !== 'number' ||
    typeof raw.ageMax !== 'number'
  )
    return undefined;
  const size = (field: unknown) => (typeof field === 'number' ? field : null);
  const refs = (list: unknown): AdStudioAudienceRef[] =>
    Array.isArray(list)
      ? list
          .filter(
            (item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object',
          )
          .map((item) => ({
            id: String(item.id ?? ''),
            name: String(item.name ?? ''),
            sizeLower: size(item.sizeLower),
            sizeUpper: size(item.sizeUpper),
          }))
      : [];
  return {
    countries: raw.countries.filter((code): code is string => typeof code === 'string'),
    ageMin: raw.ageMin,
    ageMax: raw.ageMax,
    genders: Array.isArray(raw.genders)
      ? (raw.genders.filter((gender) => typeof gender === 'string') as AdStudioGender[])
      : [],
    customAudiences: refs(raw.customAudiences),
    interests: refs(raw.interests),
  };
}
