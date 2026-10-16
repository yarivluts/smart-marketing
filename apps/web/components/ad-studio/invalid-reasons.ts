/**
 * The ad/export services explain a refusal in short English phrases written for developers. People
 * must read them in their own language, so each known phrase maps to a translation key under
 * `AdStudio.invalidReason`; anything unknown falls back to one generic line instead of leaking.
 */
const REASON_KEYS: Record<string, string> = {
  'campaign name must be 1-120 characters': 'campaignName',
  'a search ad runs on Google Ads': 'searchOnGoogle',
  'choose at least one keyword': 'keyword',
  'the search ad breaks Google limits - fix it in the Review step': 'searchLimits',
  'write the search ad first': 'searchFirst',
  'headline is required': 'headline',
  'primary text is required': 'primaryText',
  'link must be an http(s) URL': 'link',
  'daily budget must be a positive number': 'budget',
  'choose at least one country': 'country',
  'answer whether the campaign contains EU political advertising': 'euPolitical',
  'Google Ads video ads run from YouTube; publish an image ad to Google Ads': 'googleVideo',
  'Google headline must be at most 30 characters': 'googleHeadline',
  'Google long headline and description must be at most 90 characters': 'googleLongText',
  'business name must be 1-25 characters': 'businessName',
  'Google needs a square and a 1.91:1 image': 'googleImages',
  'the ad set belongs to a different ad account': 'adSetAccount',
  'the ad set to add to is not a finished Meta ad of this ad': 'adSetNotReady',
  'title must be 1-100 characters': 'title',
  'description must be at most 5000 characters': 'description',
  'privacy must be private, unlisted or public': 'privacy',
};

type Translate = (key: string) => string;

/** Plain, translated sentence parts for the server's refusal reasons, joined for one message. */
export function describeInvalidReasons(t: Translate, reasons: readonly string[] | undefined): string {
  const keys = new Set<string>();
  for (const reason of reasons ?? []) keys.add(REASON_KEYS[reason] ?? 'other');
  if (keys.size === 0) keys.add('other');
  return [...keys].map((key) => t(`invalidReason.${key}`)).join(' ');
}
