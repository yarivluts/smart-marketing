export class InvalidYouTubeCredentialSecretError extends Error {
  constructor() {
    super('Expected the YouTube credential secret to be JSON of the shape {"clientId": "...", "clientSecret": "...", "refreshToken": "..."}.');
    this.name = 'InvalidYouTubeCredentialSecretError';
  }
}

export interface YouTubeCredentialSecret {
  /** OAuth client id of the Google Cloud OAuth client the refresh token was minted with. */
  clientId: string;
  clientSecret: string;
  /** A refresh token granted the `https://www.googleapis.com/auth/youtube.upload` scope for the target channel. */
  refreshToken: string;
}

const REQUIRED_STRING_FIELDS = ['clientId', 'clientSecret', 'refreshToken'] as const;

/**
 * Parses the one JSON blob stored as a `provider: 'youtube'` shared credential's envelope-encrypted
 * secret (KAN-232) - the same one-blob posture as the Google Ads and Meta credentials, so the
 * existing Resource Library set-secret form stores it as-is. Minting the refresh token is a one-time
 * OAuth consent outside this app (the channel owner grants `youtube.upload`), as for Google Ads.
 */
export function parseYouTubeCredentialSecret(raw: string): YouTubeCredentialSecret {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new InvalidYouTubeCredentialSecretError();
  }
  if (!parsed || typeof parsed !== 'object') throw new InvalidYouTubeCredentialSecretError();
  const record = parsed as Record<string, unknown>;
  for (const field of REQUIRED_STRING_FIELDS) {
    if (typeof record[field] !== 'string' || (record[field] as string).trim().length === 0) throw new InvalidYouTubeCredentialSecretError();
  }
  return { clientId: String(record.clientId).trim(), clientSecret: String(record.clientSecret).trim(), refreshToken: String(record.refreshToken).trim() };
}
