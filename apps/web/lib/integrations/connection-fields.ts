/**
 * What the Connections page asks for, per ad platform - a client-safe copy of the ORM's
 * `AD_PLATFORM_FIELDS` (a test keeps the two equal) plus how each field is shown. Links point to
 * the platform's own page for each step of the guide.
 */

export const CONNECTION_PLATFORMS = ['meta_ads', 'google_ads', 'tiktok_ads'] as const;
export type ConnectionPlatform = (typeof CONNECTION_PLATFORMS)[number];

export interface ConnectionField {
  name: string;
  required: boolean;
  /** A token or secret: typed into a password field and never shown back. */
  secret: boolean;
  /** An account id: digits (dashes and spaces are cleaned on the server). */
  numeric: boolean;
}

const field = (name: string, options: Partial<Omit<ConnectionField, 'name'>> = {}): ConnectionField => ({ name, required: true, secret: false, numeric: false, ...options });

export const CONNECTION_FIELDS: Record<ConnectionPlatform, ConnectionField[]> = {
  meta_ads: [field('accessToken', { secret: true }), field('adAccountId', { numeric: true }), field('pageId', { numeric: true })],
  google_ads: [
    field('developerToken', { secret: true }),
    field('clientId'),
    field('clientSecret', { secret: true }),
    field('refreshToken', { secret: true }),
    field('customerId', { numeric: true }),
    field('loginCustomerId', { numeric: true, required: false }),
  ],
  tiktok_ads: [field('accessToken', { secret: true }), field('advertiserId', { numeric: true })],
};

/** The guide's steps, in order: each has its translated text and, when there is one, the page to open. */
export const CONNECTION_GUIDE_LINKS: Record<ConnectionPlatform, (string | null)[]> = {
  meta_ads: ['https://business.facebook.com/settings/system-users', null, 'https://adsmanager.facebook.com/', null],
  google_ads: ['https://ads.google.com/aw/apicenter', 'https://console.cloud.google.com/apis/credentials', 'https://developers.google.com/oauthplayground/', null],
  tiktok_ads: ['https://business-api.tiktok.com/portal/apps', 'https://business-api.tiktok.com/portal/docs?id=1738373164380162', 'https://ads.tiktok.com/', null],
};
