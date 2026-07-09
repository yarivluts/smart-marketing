import type { AcquisitionParams } from './types';

/**
 * Recognized ad-platform click-id query params, in priority order (plan `04
 * §1`'s `click_id{gclid,fbclid,ttclid}`, plus Microsoft Ads' `msclkid`). The
 * touchpoint schema (`touchpoint-schema.ts`) stores whichever one matches
 * under a single flat `click_id` field — a project's identity-key
 * registration doesn't need a separate field per ad platform — and the
 * matched param also decides the derived `channel` below.
 */
const CLICK_ID_PARAMS: readonly { param: string; channel: string }[] = [
  { param: 'gclid', channel: 'paid_search' },
  { param: 'msclkid', channel: 'paid_search' },
  { param: 'fbclid', channel: 'paid_social' },
  { param: 'ttclid', channel: 'paid_social' },
];

function trimmedOrUndefined(value: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Rough channel classification from whatever acquisition signal is present —
 * good enough to group touchpoints for a dashboard tile without a human
 * having to configure a channel-mapping table for the MVP. A matched click id
 * outranks `utm_medium` (a paid click always implies a paid channel, whatever
 * `utm_medium` a campaign builder happened to also set); an explicit
 * `utm_medium` is next; a cross-site referrer with no UTM/click params at all
 * is `referral`; no signal at all is `direct`.
 */
/** Whether `referrer` points at a different origin than the page itself — an internal link (e.g. `/pricing` -> `/signup` on the same site) is not acquisition evidence, however non-empty `document.referrer` happens to be. An unparseable referrer is treated as not cross-site (the safe default: it isn't good enough evidence to overrule `direct`). */
function isCrossSiteReferrer(referrer: string | undefined, pageOrigin: string): boolean {
  if (!referrer) return false;
  try {
    return new URL(referrer).origin !== pageOrigin;
  } catch {
    return false;
  }
}

function deriveChannel(params: {
  matchedClickChannel: string | undefined;
  utmMedium: string | undefined;
  isCrossSiteReferrer: boolean;
}): string {
  if (params.matchedClickChannel) return params.matchedClickChannel;
  if (params.utmMedium) return params.utmMedium.toLowerCase();
  if (params.isCrossSiteReferrer) return 'referral';
  return 'direct';
}

export interface ParseAcquisitionParamsInput {
  /** The page URL the visitor landed on, absolute (e.g. `location.href`). */
  url: string;
  /** `document.referrer`, if any. */
  referrer?: string;
}

/**
 * Extracts UTM params and ad-platform click ids from a landing-page URL (KAN-57
 * AC: "JS snippet/SDK storing UTM/click-ids at entry"). Pure and DOM-free so
 * it's usable from the browser tracker, the inline embed snippet, and tests
 * alike without a `window`/`document`.
 */
export function parseAcquisitionParams(input: ParseAcquisitionParamsInput): AcquisitionParams {
  const parsed = new URL(input.url);
  const query = parsed.searchParams;

  const matchedClickId = CLICK_ID_PARAMS.find(({ param }) => trimmedOrUndefined(query.get(param)) !== undefined);
  const clickId = matchedClickId ? trimmedOrUndefined(query.get(matchedClickId.param)) : undefined;

  const utmSource = trimmedOrUndefined(query.get('utm_source'));
  const utmMedium = trimmedOrUndefined(query.get('utm_medium'));
  const utmCampaign = trimmedOrUndefined(query.get('utm_campaign'));
  const utmContent = trimmedOrUndefined(query.get('utm_content'));
  const utmTerm = trimmedOrUndefined(query.get('utm_term'));
  const referrer = trimmedOrUndefined(input.referrer ?? null);

  return {
    clickId,
    utmSource,
    utmMedium,
    utmCampaign,
    utmContent,
    utmTerm,
    landingPage: `${parsed.origin}${parsed.pathname}`,
    referrer,
    channel: deriveChannel({
      matchedClickChannel: matchedClickId?.channel,
      utmMedium,
      isCrossSiteReferrer: isCrossSiteReferrer(referrer, parsed.origin),
    }),
  };
}
