import { META_CAMPAIGN_OBJECTIVES, type MetaCampaignDraft, type MetaCampaignDraftAdSet } from './executor';
import { InvalidCampaignDraftError } from './invalid-campaign-draft-error';

/** Meta's own bounds for `targeting.age_min`/`targeting.age_max`. */
const MIN_AGE = 13;
const MAX_AGE = 65;
/** Not hard API limits (Meta's Graph API accepts longer strings), but Meta's own recommended lengths for a Feed link ad — mirrors `campaign-draft.ts`'s RSA length guardrails in spirit. */
const MAX_PRIMARY_TEXT_LENGTH = 600;
const MAX_HEADLINE_LENGTH = 40;
const MAX_DESCRIPTION_LENGTH = 30;
const GENDERS = ['male', 'female'] as const;
/** ISO-3166 alpha-2: exactly two uppercase letters. */
const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `adSet` is typed as its validated shape, but at runtime this is validating an arbitrary caller-supplied JSON body cast to that type (the `campaign-drafts` route's `draft as CampaignDraft`) — every field access here must tolerate a malformed entry (a string, `null`, or an array in a spot that should be an object) without throwing, mirroring `campaign-draft.ts`'s own `validateAdGroup` posture (and the bug class a KAN-72 follow-up run found and fixed there for `negativeKeywords`: every `?.`/array access below is paired with an explicit `Array.isArray`/`isRecord` check, never a bare `?? []`). */
function validateAdSet(adSet: MetaCampaignDraftAdSet, index: number, reasons: string[]): void {
  const fieldPath = `adSets[${index}]`;
  if (!isRecord(adSet)) {
    reasons.push(`${fieldPath} must be an object.`);
    return;
  }
  if (typeof adSet.name !== 'string' || adSet.name.trim().length === 0) {
    reasons.push(`${fieldPath}.name must be a non-empty string.`);
  }

  const targeting = isRecord(adSet.targeting) ? adSet.targeting : undefined;
  if (!targeting) {
    reasons.push(`${fieldPath}.targeting must be an object.`);
  } else {
    const countries = Array.isArray(targeting.countries) ? targeting.countries : undefined;
    if (!countries || countries.length === 0) {
      reasons.push(`${fieldPath}.targeting.countries must have at least one country code.`);
    } else {
      countries.forEach((country, countryIndex) => {
        if (typeof country !== 'string' || !COUNTRY_CODE_PATTERN.test(country)) {
          reasons.push(`${fieldPath}.targeting.countries[${countryIndex}] must be a two-letter ISO-3166 country code (e.g. "US").`);
        }
      });
    }

    const ageMin = targeting.ageMin;
    const ageMax = targeting.ageMax;
    const ageMinValid = typeof ageMin === 'number' && Number.isInteger(ageMin) && ageMin >= MIN_AGE && ageMin <= MAX_AGE;
    const ageMaxValid = typeof ageMax === 'number' && Number.isInteger(ageMax) && ageMax >= MIN_AGE && ageMax <= MAX_AGE;
    if (!ageMinValid) {
      reasons.push(`${fieldPath}.targeting.ageMin must be an integer between ${MIN_AGE} and ${MAX_AGE}.`);
    }
    if (!ageMaxValid) {
      reasons.push(`${fieldPath}.targeting.ageMax must be an integer between ${MIN_AGE} and ${MAX_AGE}.`);
    }
    if (ageMinValid && ageMaxValid && (ageMin as number) > (ageMax as number)) {
      reasons.push(`${fieldPath}.targeting.ageMin must be less than or equal to ageMax.`);
    }

    if (targeting.genders !== undefined) {
      if (!Array.isArray(targeting.genders)) {
        reasons.push(`${fieldPath}.targeting.genders must be an array when present.`);
      } else {
        targeting.genders.forEach((gender, genderIndex) => {
          if (typeof gender !== 'string' || !(GENDERS as readonly string[]).includes(gender)) {
            reasons.push(`${fieldPath}.targeting.genders[${genderIndex}] must be one of ${GENDERS.join(', ')}.`);
          }
        });
      }
    }
  }

  const ad = isRecord(adSet.ad) ? adSet.ad : undefined;
  if (!ad) {
    reasons.push(`${fieldPath}.ad must be an object.`);
    return;
  }
  if (typeof ad.name !== 'string' || ad.name.trim().length === 0) {
    reasons.push(`${fieldPath}.ad.name must be a non-empty string.`);
  }

  const creative = isRecord(ad.creative) ? ad.creative : undefined;
  validateMetaAdCreativeContent(creative, `${fieldPath}.ad.creative`, reasons);
}

/**
 * Validates one Meta ad's own editable creative content (primary text,
 * headline, description, link URL) against Meta's own real-world Feed
 * link-ad recommended lengths — shared by {@link validateAdSet} (a
 * brand-new ad set's own creative, nested under `ad.creative`) and
 * {@link validateMetaAdCreativeEditActionInput} (a `meta_ad_creative_edit`
 * action's replacement creative content, same shape one level up) so the
 * two never drift, mirroring `campaign-draft.ts`'s own
 * `validateResponsiveSearchAdContent`/`validateAdEditActionInput` pairing.
 * `fieldPath` is the caller's own prefix (e.g. `adSets[0].ad.creative` or
 * just `creative`).
 */
export function validateMetaAdCreativeContent(creative: Record<string, unknown> | undefined, fieldPath: string, reasons: string[]): void {
  if (!creative) {
    reasons.push(`${fieldPath} must be an object.`);
    return;
  }
  if (typeof creative.primaryText !== 'string' || creative.primaryText.trim().length === 0 || creative.primaryText.length > MAX_PRIMARY_TEXT_LENGTH) {
    reasons.push(`${fieldPath}.primaryText must be 1-${MAX_PRIMARY_TEXT_LENGTH} characters.`);
  }
  if (typeof creative.headline !== 'string' || creative.headline.trim().length === 0 || creative.headline.length > MAX_HEADLINE_LENGTH) {
    reasons.push(`${fieldPath}.headline must be 1-${MAX_HEADLINE_LENGTH} characters.`);
  }
  if (creative.description !== undefined) {
    if (typeof creative.description !== 'string' || creative.description.length > MAX_DESCRIPTION_LENGTH) {
      reasons.push(`${fieldPath}.description must be at most ${MAX_DESCRIPTION_LENGTH} characters when present.`);
    }
  }
  if (typeof creative.linkUrl !== 'string' || creative.linkUrl.length === 0 || !isHttpUrl(creative.linkUrl)) {
    reasons.push(`${fieldPath}.linkUrl must be a valid http(s) URL.`);
  }
}

/**
 * Validates a {@link MetaCampaignDraft} against Meta's own real-world limits
 * (age range 13-65, ISO-3166 alpha-2 country codes, recommended Feed link-ad
 * text lengths) — collects every violation before throwing one
 * `InvalidCampaignDraftError`, mirroring `validateGoogleAdsCampaignDraft`'s
 * "report every reason at once" posture exactly. `draft` is typed as its
 * validated shape, but at runtime this is validating an arbitrary
 * caller-supplied JSON body cast to that type (the `campaign-drafts` route's
 * `draft as CampaignDraft`) — every nested field access here tolerates a
 * malformed entry without throwing an unhandled exception, the same bug
 * class a KAN-72 follow-up run found and fixed for Google's own
 * `negativeKeywords` field (every `?.`/array access below is paired with an
 * explicit `Array.isArray`/`isRecord` check, never a bare `?? []`).
 */
export function validateMetaCampaignDraft(draft: MetaCampaignDraft): void {
  if (!isRecord(draft)) {
    throw new InvalidCampaignDraftError(['draft must be an object.']);
  }

  const reasons: string[] = [];

  if (typeof draft.campaignName !== 'string' || draft.campaignName.trim().length === 0) {
    reasons.push('campaignName must be a non-empty string.');
  }
  if (typeof draft.objective !== 'string' || !(META_CAMPAIGN_OBJECTIVES as readonly string[]).includes(draft.objective)) {
    reasons.push(`objective must be one of ${META_CAMPAIGN_OBJECTIVES.join(', ')}.`);
  }
  if (!Number.isFinite(draft.dailyBudgetUsd) || draft.dailyBudgetUsd <= 0) {
    reasons.push('dailyBudgetUsd must be a positive number.');
  }
  if (!Array.isArray(draft.adSets) || draft.adSets.length === 0) {
    reasons.push('adSets must have at least one ad set.');
  } else {
    draft.adSets.forEach((adSet, index) => validateAdSet(adSet, index, reasons));
  }

  if (reasons.length > 0) {
    throw new InvalidCampaignDraftError(reasons);
  }
}

/**
 * Validates a `meta_ad_creative_edit` action's proposed input (KAN-73
 * follow-up) — an `adResourceName` plus the replacement creative content.
 * Reuses {@link validateMetaAdCreativeContent}'s own length/URL checks so a
 * replacement creative is held to the exact same shape a
 * `campaign_draft_create` ad set's own `ad.creative` is, mirroring
 * `campaign-draft.ts`'s `validateAdEditActionInput`. Tolerates a malformed/
 * untrusted-cast request body the same way `validateAdEditActionInput`
 * does — the `meta-ad-creative-edits` route casts an arbitrary JSON body to
 * this shape before calling in.
 */
export function validateMetaAdCreativeEditActionInput(input: {
  adResourceName: unknown;
  primaryText: unknown;
  headline: unknown;
  description: unknown;
  linkUrl: unknown;
}): void {
  if (!isRecord(input)) {
    throw new InvalidCampaignDraftError(['input must be an object.']);
  }

  const reasons: string[] = [];

  if (typeof input.adResourceName !== 'string' || input.adResourceName.trim().length === 0) {
    reasons.push('adResourceName must be a non-empty string.');
  }

  validateMetaAdCreativeContent(input, 'creative', reasons);

  if (reasons.length > 0) {
    throw new InvalidCampaignDraftError(reasons);
  }
}
