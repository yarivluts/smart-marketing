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
/**
 * A whole `campaign_draft_create` action (including this creative's own
 * `imageDataUrl`) is persisted verbatim on the proposed action's
 * `after.campaignDraft` — a single Firestore document, capped at 1 MiB. This
 * caps the data URL's own string length well under that (~530K base64
 * characters is ~390KB of raw image bytes after the ~4/3 base64 expansion),
 * leaving comfortable headroom for the rest of the draft/action document.
 */
export const MAX_IMAGE_DATA_URL_LENGTH = 530_000;
/** Meta's `/adimages` endpoint accepts common web image formats; JPEG/PNG cover the vast majority of real ad creative assets and keep this validation simple. */
const IMAGE_DATA_URL_PATTERN = /^data:image\/(png|jpe?g);base64,[A-Za-z0-9+/]+=*$/;

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
  if (!creative) {
    reasons.push(`${fieldPath}.ad.creative must be an object.`);
    return;
  }
  validateMetaCreativeContent(creative, `${fieldPath}.ad.creative`, reasons);
}

/**
 * Validates one Meta link-ad creative's own editable content (primary text,
 * headline, description, link URL, optional image) against Meta's own
 * real-world Feed link-ad limits — shared by {@link validateAdSet} (a
 * brand-new ad set's own creative, nested under `ad.creative`) and
 * `validateAdCreativeEditActionInput` (`campaign-draft.ts`, an
 * `ad_creative_edit` action's replacement creative content, same shape one
 * level up) so the two never drift, mirroring
 * `validateResponsiveSearchAdContent`'s own reuse posture for Google's RSA
 * content one file over. `fieldPath` is the caller's own prefix (e.g.
 * `adSets[0].ad.creative` or just `creative`).
 */
export function validateMetaCreativeContent(creative: Record<string, unknown> | undefined, fieldPath: string, reasons: string[]): void {
  if (typeof creative?.primaryText !== 'string' || creative.primaryText.trim().length === 0 || creative.primaryText.length > MAX_PRIMARY_TEXT_LENGTH) {
    reasons.push(`${fieldPath}.primaryText must be 1-${MAX_PRIMARY_TEXT_LENGTH} characters.`);
  }
  if (typeof creative?.headline !== 'string' || creative.headline.trim().length === 0 || creative.headline.length > MAX_HEADLINE_LENGTH) {
    reasons.push(`${fieldPath}.headline must be 1-${MAX_HEADLINE_LENGTH} characters.`);
  }
  if (creative?.description !== undefined) {
    if (typeof creative.description !== 'string' || creative.description.length > MAX_DESCRIPTION_LENGTH) {
      reasons.push(`${fieldPath}.description must be at most ${MAX_DESCRIPTION_LENGTH} characters when present.`);
    }
  }
  if (typeof creative?.linkUrl !== 'string' || creative.linkUrl.length === 0 || !isHttpUrl(creative.linkUrl)) {
    reasons.push(`${fieldPath}.linkUrl must be a valid http(s) URL.`);
  }
  if (creative?.imageDataUrl !== undefined) {
    if (typeof creative.imageDataUrl !== 'string' || creative.imageDataUrl.length > MAX_IMAGE_DATA_URL_LENGTH || !IMAGE_DATA_URL_PATTERN.test(creative.imageDataUrl)) {
      reasons.push(
        `${fieldPath}.imageDataUrl must be a base64 data:image/(png|jpeg) URL of at most ${MAX_IMAGE_DATA_URL_LENGTH} characters when present.`,
      );
    }
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
