import type { CampaignDraft, CampaignDraftAdGroup, CampaignDraftKeyword } from './executor';

export class InvalidCampaignDraftError extends Error {
  constructor(public readonly reasons: readonly string[]) {
    super(`Invalid campaign draft: ${reasons.join('; ')}`);
    this.name = 'InvalidCampaignDraftError';
  }
}

const KEYWORD_MATCH_TYPES = ['EXACT', 'PHRASE', 'BROAD'] as const;
const MAX_HEADLINE_LENGTH = 30;
const MAX_DESCRIPTION_LENGTH = 90;
const MIN_HEADLINES = 3;
const MAX_HEADLINES = 15;
const MIN_DESCRIPTIONS = 2;
const MAX_DESCRIPTIONS = 4;

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

  (adGroup.negativeKeywords ?? []).forEach((keyword, keywordIndex) =>
    validateKeyword(keyword, `${fieldPath}.negativeKeywords[${keywordIndex}]`, reasons),
  );
}

/**
 * Validates a {@link CampaignDraft} against Google Ads' own real-world Search
 * campaign limits (RSA headline/description counts and lengths, keyword text
 * length) — collects every violation before throwing (the same "report every
 * reason at once" posture `parsePluginManifest`/`validateFields` use) rather
 * than failing on the first, so a caller fixing a rejected draft doesn't have
 * to resubmit once per mistake. Performance Max isn't supported yet (see
 * `CampaignDraft`'s own doc comment), so `advertisingChannelType` is
 * currently typed to only ever be `'SEARCH'`.
 */
export function validateCampaignDraft(draft: CampaignDraft): void {
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
