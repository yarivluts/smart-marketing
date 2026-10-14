export class InvalidTikTokAdsCredentialSecretError extends Error {
  constructor() {
    super('Expected the TikTok Ads credential secret to be JSON of the shape {"accessToken": "...", "advertiserId": "1234567890"}.');
    this.name = 'InvalidTikTokAdsCredentialSecretError';
  }
}

export interface TikTokAdsCredentialSecret {
  /** A long-lived access token from TikTok's advertiser authorization (Marketing API). */
  accessToken: string;
  /** The TikTok advertiser account id (digits only). */
  advertiserId: string;
}

/**
 * Parses a `provider: 'tiktok_ads'` credential's secret: the access token TikTok issues when an
 * advertiser authorizes the app, and the advertiser account it acts on.
 */
export function parseTikTokAdsCredentialSecret(raw: string): TikTokAdsCredentialSecret {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new InvalidTikTokAdsCredentialSecretError();
  }
  if (typeof parsed !== 'object' || parsed === null) throw new InvalidTikTokAdsCredentialSecretError();
  const record = parsed as Record<string, unknown>;
  const accessToken = typeof record.accessToken === 'string' ? record.accessToken.trim() : '';
  const advertiserId = typeof record.advertiserId === 'string' ? record.advertiserId.trim() : '';
  if (!accessToken || !/^\d+$/.test(advertiserId)) throw new InvalidTikTokAdsCredentialSecretError();
  return { accessToken, advertiserId };
}
