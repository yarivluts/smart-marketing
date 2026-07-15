import type { CampaignDraft, CampaignDraftAdGroup, CampaignDraftKeyword, GoogleAdsCampaignDraft, MetaCampaignDraft } from './executor';
import { InvalidCampaignDraftError } from './invalid-campaign-draft-error';
import { validateMetaCampaignDraft } from './meta-campaign-draft';

export { InvalidCampaignDraftError };

const KEYWORD_MATCH_TYPES = ['EXACT', 'PHRASE', 'BROAD'] as const;
const MAX_HEADLINE_LENGTH = 30;
const MAX_DESCRIPTION_LENGTH = 90;
const MIN_HEADLINES = 3;
const MAX_HEADLINES = 15;
const MIN_DESCRIPTIONS = 2;
const MAX_DESCRIPTIONS = 4;

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `keyword`/`adGroup` are typed as their validated shape, but at runtime this is validating an arbitrary caller-supplied JSON body cast to that type (`campaign-drafts` route) — every field access here must tolerate a malformed entry (a string, `null`, or an array in a spot that should be an object) without throwing, so a bad request yields a clean `InvalidCampaignDraftError` (-> 400) rather than an unhandled exception (-> 500). */
function validateKeyword(keyword: CampaignDraftKeyword, fieldPath: string, reasons: string[]): void {
  if (!isRecord(keyword)) {
    reasons.push(`${fieldPath} must be an object with \`text\`/\`matchType\`.`);
    return;
  }
  if (typeof keyword.text !== 'string' || keyword.text.trim().length === 0) {
    reasons.push(`${fieldPath}.text must be a non-empty string.`);
  } else if (keyword.text.length > 80) {
    reasons.push(`${fieldPath}.text must be 80 characters or fewer.`);
  }
  if (typeof keyword.matchType !== 'string' || !(KEYWORD_MATCH_TYPES as readonly string[]).includes(keyword.matchType)) {
    reasons.push(`${fieldPath}.matchType must be one of ${KEYWORD_MATCH_TYPES.join(', ')}.`);
  }
}

function validateAdGroup(adGroup: CampaignDraftAdGroup, index: number, reasons: string[]): void {
  const fieldPath = `adGroups[${index}]`;
  if (!isRecord(adGroup)) {
    reasons.push(`${fieldPath} must be an object.`);
    return;
  }
  if (typeof adGroup.name !== 'string' || adGroup.name.trim().length === 0) {
    reasons.push(`${fieldPath}.name must be a non-empty string.`);
  }

  const responsiveSearchAd = isRecord(adGroup.responsiveSearchAd) ? adGroup.responsiveSearchAd : undefined;
  const headlines = Array.isArray(responsiveSearchAd?.headlines) ? responsiveSearchAd.headlines : [];
  if (headlines.length < MIN_HEADLINES || headlines.length > MAX_HEADLINES) {
    reasons.push(`${fieldPath}.responsiveSearchAd.headlines must have between ${MIN_HEADLINES} and ${MAX_HEADLINES} entries.`);
  }
  headlines.forEach((headline, headlineIndex) => {
    if (typeof headline !== 'string' || headline.trim().length === 0 || headline.length > MAX_HEADLINE_LENGTH) {
      reasons.push(`${fieldPath}.responsiveSearchAd.headlines[${headlineIndex}] must be 1-${MAX_HEADLINE_LENGTH} characters.`);
    }
  });

  const descriptions = Array.isArray(responsiveSearchAd?.descriptions) ? responsiveSearchAd.descriptions : [];
  if (descriptions.length < MIN_DESCRIPTIONS || descriptions.length > MAX_DESCRIPTIONS) {
    reasons.push(`${fieldPath}.responsiveSearchAd.descriptions must have between ${MIN_DESCRIPTIONS} and ${MAX_DESCRIPTIONS} entries.`);
  }
  descriptions.forEach((description, descriptionIndex) => {
    if (typeof description !== 'string' || description.trim().length === 0 || description.length > MAX_DESCRIPTION_LENGTH) {
      reasons.push(`${fieldPath}.responsiveSearchAd.descriptions[${descriptionIndex}] must be 1-${MAX_DESCRIPTION_LENGTH} characters.`);
    }
  });

  const finalUrl = responsiveSearchAd?.finalUrl;
  if (typeof finalUrl !== 'string' || finalUrl.length === 0 || !isHttpUrl(finalUrl)) {
    reasons.push(`${fieldPath}.responsiveSearchAd.finalUrl must be a valid http(s) URL.`);
  }

  if (!Array.isArray(adGroup.keywords) || adGroup.keywords.length === 0) {
    reasons.push(`${fieldPath}.keywords must have at least one keyword.`);
  } else {
    adGroup.keywords.forEach((keyword, keywordIndex) => validateKeyword(keyword, `${fieldPath}.keywords[${keywordIndex}]`, reasons));
  }

  // `negativeKeywords ?? []` would only substitute on `null`/`undefined` — a
  // non-array value (e.g. a string) in an untrusted request body must still
  // be tolerated here, the exact bug class a KAN-72 follow-up run found and
  // fixed for this same field (see PROGRESS.md).
  if (adGroup.negativeKeywords !== undefined && !Array.isArray(adGroup.negativeKeywords)) {
    reasons.push(`${fieldPath}.negativeKeywords must be an array when present.`);
  } else {
    (Array.isArray(adGroup.negativeKeywords) ? adGroup.negativeKeywords : []).forEach((keyword, keywordIndex) =>
      validateKeyword(keyword, `${fieldPath}.negativeKeywords[${keywordIndex}]`, reasons),
    );
  }
}

/**
 * Validates a {@link GoogleAdsCampaignDraft} against Google Ads' own
 * real-world Search campaign limits (RSA headline/description counts and
 * lengths, keyword text length) — collects every violation before throwing
 * (the same "report every reason at once" posture `parsePluginManifest`/
 * `validateFields` use) rather than failing on the first, so a caller fixing
 * a rejected draft doesn't have to resubmit once per mistake. Performance Max
 * isn't supported yet (see `GoogleAdsCampaignDraft`'s own doc comment), so
 * `advertisingChannelType` is currently typed to only ever be `'SEARCH'`.
 * Tolerates a malformed/untrusted-cast request body at every nesting level —
 * see `validateAdGroup`'s own doc comment.
 */
export function validateGoogleAdsCampaignDraft(draft: GoogleAdsCampaignDraft): void {
  if (!isRecord(draft)) {
    throw new InvalidCampaignDraftError(['draft must be an object.']);
  }

  const reasons: string[] = [];

  if (typeof draft.campaignName !== 'string' || draft.campaignName.trim().length === 0) {
    reasons.push('campaignName must be a non-empty string.');
  }
  if (!Number.isFinite(draft.dailyBudgetUsd) || draft.dailyBudgetUsd <= 0) {
    reasons.push('dailyBudgetUsd must be a positive number.');
  }
  if (draft.advertisingChannelType !== 'SEARCH') {
    reasons.push('advertisingChannelType must be "SEARCH" (Performance Max is not supported yet).');
  }
  if (!Array.isArray(draft.adGroups) || draft.adGroups.length === 0) {
    reasons.push('adGroups must have at least one ad group.');
  } else {
    draft.adGroups.forEach((adGroup, index) => validateAdGroup(adGroup, index, reasons));
  }

  if (reasons.length > 0) {
    throw new InvalidCampaignDraftError(reasons);
  }
}

/**
 * Validates a {@link CampaignDraft} by dispatching on its `platform`
 * discriminant (KAN-73) — `'google_ads'` (or a missing `platform`, which
 * defaults to `'google_ads'` for backward compatibility with callers that
 * predate this field) goes to {@link validateGoogleAdsCampaignDraft};
 * `'meta'` goes to `validateMetaCampaignDraft` (`meta-campaign-draft.ts`).
 * `draft` is typed as the validated union, but at runtime this is validating
 * an arbitrary caller-supplied JSON body cast to that type (the
 * `campaign-drafts` route's `draft as CampaignDraft`) — a non-object `draft`
 * or an unrecognized `platform` value reports a clean `InvalidCampaignDraftError`
 * (-> 400) rather than throwing an unhandled exception (-> 500), the same bug
 * class a KAN-72 follow-up run found and fixed for `negativeKeywords`.
 */
export function validateCampaignDraft(draft: CampaignDraft): void {
  if (!isRecord(draft)) {
    throw new InvalidCampaignDraftError(['draft must be an object.']);
  }
  const platform = (draft as { platform?: unknown }).platform;
  if (platform === 'meta') {
    validateMetaCampaignDraft(draft as unknown as MetaCampaignDraft);
    return;
  }
  if (platform !== undefined && platform !== 'google_ads') {
    throw new InvalidCampaignDraftError([`platform must be "google_ads" or "meta" (got ${JSON.stringify(platform)}).`]);
  }
  validateGoogleAdsCampaignDraft(draft as unknown as GoogleAdsCampaignDraft);
}
